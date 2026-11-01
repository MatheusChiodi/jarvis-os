import crypto from 'node:crypto';
import { executeTool, getAllToolDefinitions, classifyToolRisk } from '@jarvis-os/tools';
import { config } from '../config.js';
import type { ActiveSession, ToolExecutionContext, TurnState } from '../interfaces/index.js';
import { send } from '../websocket.js';
import { saveMessage } from './message.js';
import { providerRegistry } from './providers.js';
import { getHistory } from './session.js';
import { createApproval } from './approval.js';

export async function runAgentTurn(
  session: ActiveSession,
  userMessage: string,
  ws: any
): Promise<void> {
  const turnState: TurnState = {
    aborted: false,
    abortController: new AbortController(),
    messageId: crypto.randomUUID(),
    startTime: Date.now(),
  };
  session.currentTurn = turnState;

  let accumulatedContent = '';
  let toolCalls: any[] = [];

  const userMsg = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString(),
  };
  saveMessage(session.sessionId, userMsg);

  send(ws, {
    type: 'agent.state',
    agentId: 'jarvis',
    state: 'thinking',
    ts: new Date().toISOString(),
    sessionId: session.sessionId,
  });

  const systemPrompt = `You are JARVIS. Workspaces: ${config.workspaces.join(', ')}`;
  const history = getHistory(session.sessionId);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const tools = getAllToolDefinitions().map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  try {
    for await (const chunk of providerRegistry.chatCompletion({
      model: 'default',
      messages,
      tools,
      toolChoice: 'auto',
      temperature: 0.7,
      stream: true,
    })) {
      if (turnState.aborted) break;
      if (chunk.content) {
        accumulatedContent += chunk.content;
        send(ws, {
          type: 'message.delta',
          messageId: crypto.randomUUID(),
          text: chunk.content,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
      }
      if (chunk.toolCalls && chunk.done) {
        toolCalls = chunk.toolCalls;
      }
      if (chunk.done) break;
    }
  } catch (error) {
    console.error('Provider error:', error);
    send(ws, {
      type: 'error',
      code: 'PROVIDER_UNAVAILABLE',
      message: String(error),
      ts: new Date().toISOString(),
      sessionId: session.sessionId,
    });
    session.currentTurn = null;
    return;
  }

  if (toolCalls.length > 0) {
    send(ws, {
      type: 'agent.state',
      agentId: 'jarvis',
      state: 'running-tool',
      ts: new Date().toISOString(),
      sessionId: session.sessionId,
    });

    for (const tc of toolCalls) {
      if (turnState.aborted) break;

      const toolName = tc.function.name;
      const toolArgs = JSON.parse(tc.function.arguments);
      const callId = tc.id;

      // Classify risk before execution
      const risk = classifyToolRisk(toolName, toolArgs, config.workspaces);

      // For write and dangerous operations, require approval
      let approved = true;
      let approvalId = '';
      if (risk === 'write' || risk === 'dangerous') {
        const reason = risk === 'dangerous'
          ? `Command classified as dangerous: ${toolName}`
          : `Write operation: ${toolName}`;
        const approvalResult = await createApproval(session.sessionId, toolName, toolArgs, reason, config.agent.approvalTimeoutMs);
        approvalId = approvalResult.approvalId;
        approved = approvalResult.decision === 'approve';

        // Send approval.requested with the actual approvalId
        send(ws, {
          type: 'approval.requested',
          approvalId,
          tool: toolName,
          args: toolArgs,
          reason,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });

        // Send the actual risk level in tool.started
        send(ws, {
          type: 'tool.started',
          callId,
          tool: toolName,
          args: toolArgs,
          risk,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
      } else {
        // For safe operations, send tool.started with safe risk
        send(ws, {
          type: 'tool.started',
          callId,
          tool: toolName,
          args: toolArgs,
          risk: 'safe',
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
      }

      if (!approved) {
        // Tool denied - send tool.finished with ok: false
        send(ws, {
          type: 'tool.finished',
          callId,
          ok: false,
          outputPreview: 'Operation denied by user',
          durationMs: Date.now() - turnState.startTime,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
        messages.push({ role: 'tool', content: 'Error: Operation denied by user', tool_call_id: callId } as any);
        continue;
      }

      try {
        const toolContext: ToolExecutionContext = {
          sessionId: session.sessionId,
          vault: session.vault,
          vectorIndex: session.vectorIndex,
          progressiveDisclosure: session.progressiveDisclosure,
          config: {
            workspaces: config.workspaces,
            maxToolOutputChars: config.agent.maxToolOutputChars,
          },
        };

        const result = await executeTool(toolName, toolArgs, toolContext);

        send(ws, {
          type: 'tool.finished',
          callId,
          ok: true,
          outputPreview: result.output.slice(0, 500),
          durationMs: Date.now() - turnState.startTime,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
        messages.push({ role: 'tool', content: result.output, tool_call_id: callId } as any);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        send(ws, {
          type: 'tool.finished',
          callId,
          ok: false,
          outputPreview: errMsg,
          durationMs: Date.now() - turnState.startTime,
          ts: new Date().toISOString(),
          sessionId: session.sessionId,
        });
        messages.push({ role: 'tool', content: `Error: ${errMsg}`, tool_call_id: callId } as any);
      }
    }

    if (!turnState.aborted) {
      try {
        for await (const chunk of providerRegistry.chatCompletion({
          model: 'default',
          messages,
          tools,
          toolChoice: 'auto',
          temperature: 0.7,
          stream: true,
        })) {
          if (turnState.aborted) break;
          if (chunk.content) {
            accumulatedContent += chunk.content;
            send(ws, {
              type: 'message.delta',
              messageId: crypto.randomUUID(),
              text: chunk.content,
              ts: new Date().toISOString(),
              sessionId: session.sessionId,
            });
          }
          if (chunk.done) break;
        }
      } catch (error) {
        console.error('Provider error after tools:', error);
      }
    }
  }

  const assistantMsg = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: accumulatedContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    model: 'jarvis',
    createdAt: new Date().toISOString(),
  };
  saveMessage(session.sessionId, assistantMsg);
  send(ws, {
    type: 'message.completed',
    message: assistantMsg,
    usage: undefined,
    model: 'jarvis',
    ts: new Date().toISOString(),
    sessionId: session.sessionId,
  });
  send(ws, {
    type: 'agent.state',
    agentId: 'jarvis',
    state: 'idle',
    ts: new Date().toISOString(),
    sessionId: session.sessionId,
  });
  session.currentTurn = null;
}
