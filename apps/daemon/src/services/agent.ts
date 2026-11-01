import type { ActiveSession, TurnState, ToolExecutionContext } from '../interfaces/index.js';
import { config } from '../config.js';
import { providerRegistry } from './providers.js';
import { getAllToolDefinitions, executeTool } from '@jarvis-os/tools';
import { saveMessage } from './message.js';
import { send } from '../websocket.js';
import { getHistory } from './session.js';
import crypto from 'node:crypto';

export async function runAgentTurn(
  session: ActiveSession,
  userMessage: string,
  ws: any
): Promise<void> {
  const turnState: TurnState = {
    aborted: false,
    abortController: new AbortController(),
    messageId: crypto.randomUUID(),
    startTime: Date.now()
  };
  session.currentTurn = turnState;

  let accumulatedContent = '';
  let toolCalls: any[] = [];

  const userMsg = {
    id: crypto.randomUUID(),
    role: 'user',
    content: userMessage,
    createdAt: new Date().toISOString()
  };
  saveMessage(session.sessionId, userMsg);

  send(ws, { type: 'agent.state', agentId: 'jarvis', state: 'thinking', ts: new Date().toISOString(), sessionId: session.sessionId });

  const systemPrompt = `You are JARVIS. Workspaces: ${config.workspaces.join(', ')}`;
  const history = getHistory(session.sessionId);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage }
  ];

  const tools = getAllToolDefinitions().map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));

  try {
    for await (const chunk of providerRegistry.chatCompletion({
      model: 'default',
      messages,
      tools,
      toolChoice: 'auto',
      temperature: 0.7,
      stream: true
    })) {
      if (turnState.aborted) break;
      if (chunk.content) {
        accumulatedContent += chunk.content;
        send(ws, { type: 'message.delta', messageId: crypto.randomUUID(), text: chunk.content, ts: new Date().toISOString(), sessionId: session.sessionId });
      }
      if (chunk.toolCalls && chunk.done) {
        toolCalls = chunk.toolCalls;
      }
      if (chunk.done) break;
    }
  } catch (error) {
    console.error('Provider error:', error);
    send(ws, { type: 'error', code: 'PROVIDER_UNAVAILABLE', message: String(error), ts: new Date().toISOString(), sessionId: session.sessionId });
    session.currentTurn = null;
    return;
  }

  if (toolCalls.length > 0) {
    send(ws, { type: 'agent.state', agentId: 'jarvis', state: 'running-tool', ts: new Date().toISOString(), sessionId: session.sessionId });

    for (const tc of toolCalls) {
      if (turnState.aborted) break;

      const toolName = tc.function.name;
      const toolArgs = JSON.parse(tc.function.arguments);
      const callId = tc.id;

      send(ws, { type: 'tool.started', callId, tool: toolName, args: toolArgs, risk: 'write', ts: new Date().toISOString(), sessionId: session.sessionId });

      try {
        const toolContext: ToolExecutionContext = {
          sessionId: session.sessionId,
          vault: session.vault,
          vectorIndex: session.vectorIndex,
          progressiveDisclosure: session.progressiveDisclosure,
          config: { workspaces: config.workspaces, maxToolOutputChars: config.agent.maxToolOutputChars }
        };

        const result = await executeTool(toolName, toolArgs, toolContext);

        send(ws, { type: 'tool.finished', callId, ok: true, outputPreview: result.output.slice(0, 500), durationMs: Date.now() - turnState.startTime, ts: new Date().toISOString(), sessionId: session.sessionId });
        messages.push({ role: 'tool', content: result.output, tool_call_id: callId } as any);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        send(ws, { type: 'tool.finished', callId, ok: false, outputPreview: errMsg, durationMs: Date.now() - turnState.startTime, ts: new Date().toISOString(), sessionId: session.sessionId });
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
          stream: true
        })) {
          if (turnState.aborted) break;
          if (chunk.content) {
            accumulatedContent += chunk.content;
            send(ws, { type: 'message.delta', messageId: crypto.randomUUID(), text: chunk.content, ts: new Date().toISOString(), sessionId: session.sessionId });
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
    createdAt: new Date().toISOString()
  };
  saveMessage(session.sessionId, assistantMsg);
  send(ws, { type: 'message.completed', message: assistantMsg, usage: undefined, model: 'jarvis', ts: new Date().toISOString(), sessionId: session.sessionId });
  send(ws, { type: 'agent.state', agentId: 'jarvis', state: 'idle', ts: new Date().toISOString(), sessionId: session.sessionId });
  session.currentTurn = null;
}