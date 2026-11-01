import { z } from 'zod';

// ============================================================================
// Base Types
// ============================================================================

export const AgentStateSchema = z.enum([
  'idle',
  'thinking',
  'typing',
  'reading',
  'running-tool',
  'waiting-approval',
  'error',
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

export const ToolRiskSchema = z.enum(['safe', 'write', 'dangerous']);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const ApprovalDecisionSchema = z.enum(['approve', 'deny']);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'BAD_REQUEST',
  'BUSY',
  'MAX_ITERATIONS',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// ============================================================================
// Client -> Daemon Messages
// ============================================================================

export const AuthMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string(),
});

export const SessionCreateMessageSchema = z.object({
  type: z.literal('session.create'),
  title: z.string().optional(),
});

export const SessionListMessageSchema = z.object({
  type: z.literal('session.list'),
});

export const SessionHistoryMessageSchema = z.object({
  type: z.literal('session.history'),
  sessionId: z.string(),
});

export const ChatSendMessageSchema = z.object({
  type: z.literal('chat.send'),
  sessionId: z.string(),
  text: z.string(),
});

export const ChatCancelMessageSchema = z.object({
  type: z.literal('chat.cancel'),
  sessionId: z.string(),
});

export const ApprovalRespondMessageSchema = z.object({
  type: z.literal('approval.respond'),
  approvalId: z.string(),
  decision: ApprovalDecisionSchema,
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  AuthMessageSchema,
  SessionCreateMessageSchema,
  SessionListMessageSchema,
  SessionHistoryMessageSchema,
  ChatSendMessageSchema,
  ChatCancelMessageSchema,
  ApprovalRespondMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ============================================================================
// Daemon -> Client Messages
// ============================================================================

export const AgentStateMessageSchema = z.object({
  type: z.literal('agent.state'),
  agentId: z.string(),
  state: AgentStateSchema,
  ts: z.string(),
  sessionId: z.string().optional(),
});

export const MessageDeltaSchema = z.object({
  type: z.literal('message.delta'),
  messageId: z.string(),
  text: z.string(),
  ts: z.string(),
  sessionId: z.string(),
});

export const MessageCompletedSchema = z.object({
  type: z.literal('message.completed'),
  message: z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    toolCalls: z.array(z.unknown()).optional(),
    toolCallId: z.string().optional(),
    model: z.string().optional(),
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    createdAt: z.string(),
  }),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
    })
    .optional(),
  model: z.string(),
  ts: z.string(),
  sessionId: z.string(),
});

export const ToolStartedSchema = z.object({
  type: z.literal('tool.started'),
  callId: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()),
  risk: ToolRiskSchema,
  ts: z.string(),
  sessionId: z.string(),
});

export const ToolFinishedSchema = z.object({
  type: z.literal('tool.finished'),
  callId: z.string(),
  ok: z.boolean(),
  outputPreview: z.string(),
  durationMs: z.number(),
  ts: z.string(),
  sessionId: z.string(),
});

export const ApprovalRequestedSchema = z.object({
  type: z.literal('approval.requested'),
  approvalId: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()),
  reason: z.string(),
  ts: z.string(),
  sessionId: z.string(),
});

export const ApprovalResolvedSchema = z.object({
  type: z.literal('approval.resolved'),
  approvalId: z.string(),
  decision: ApprovalDecisionSchema,
  ts: z.string(),
  sessionId: z.string(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string(),
  ts: z.string(),
  sessionId: z.string().optional(),
});

export const SessionCreatedSchema = z.object({
  type: z.literal('session.created'),
  session: z.object({
    id: z.string(),
    title: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  ts: z.string(),
});

export const SessionListResultSchema = z.object({
  type: z.literal('session.list.result'),
  sessions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  ts: z.string(),
});

export const SessionHistoryResultSchema = z.object({
  type: z.literal('session.history.result'),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      toolCalls: z.array(z.unknown()).optional(),
      toolCallId: z.string().optional(),
      model: z.string().optional(),
      promptTokens: z.number().optional(),
      completionTokens: z.number().optional(),
      createdAt: z.string(),
    })
  ),
  ts: z.string(),
});

export const DaemonMessageSchema = z.discriminatedUnion('type', [
  AgentStateMessageSchema,
  MessageDeltaSchema,
  MessageCompletedSchema,
  ToolStartedSchema,
  ToolFinishedSchema,
  ApprovalRequestedSchema,
  ApprovalResolvedSchema,
  ErrorMessageSchema,
  SessionCreatedSchema,
  SessionListResultSchema,
  SessionHistoryResultSchema,
]);

export type DaemonMessage = z.infer<typeof DaemonMessageSchema>;

// ============================================================================
// HTTP Endpoints
// ============================================================================

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ============================================================================
// Configuration
// ============================================================================

export const ProviderConfigSchema = z.object({
  id: z.string(),
  baseUrl: z.string().url(),
  apiKeyEnv: z.string(),
});

export const DaemonConfigSchema = z.object({
  host: z.string().ip(),
  port: z.number().int().min(1).max(65535),
});

export const RoutesConfigSchema = z.object({
  default: z.array(z.string()),
});

export const AgentConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(100),
  maxToolOutputChars: z.number().int().min(1000),
  approvalTimeoutMs: z.number().int().min(1000),
});

export const ConfigSchema = z.object({
  daemon: DaemonConfigSchema,
  providers: z.array(ProviderConfigSchema),
  routes: RoutesConfigSchema,
  workspaces: z.array(z.string()),
  agent: AgentConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ============================================================================
// Database Types
// ============================================================================

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  toolCalls: z.string().nullable(),
  toolCallId: z.string().nullable(),
  model: z.string().nullable(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  createdAt: z.string(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tool: z.string(),
  args: z.string(),
  reason: z.string(),
  decision: z.string().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type Approval = z.infer<typeof ApprovalSchema>;

// ============================================================================
// Tool Definitions
// ============================================================================

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

export type Tool = z.infer<typeof ToolSchema>;

// ============================================================================
// Utility Functions
// ============================================================================

export function validateClientMessage(data: unknown): ClientMessage {
  return ClientMessageSchema.parse(data);
}

export function validateDaemonMessage(data: unknown): DaemonMessage {
  return DaemonMessageSchema.parse(data);
}

export function validateConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

export function createAuthMessage(token: string): z.infer<typeof AuthMessageSchema> {
  return { type: 'auth', token };
}

export function createSessionCreateMessage(
  title?: string
): z.infer<typeof SessionCreateMessageSchema> {
  return { type: 'session.create', title };
}

export function createChatSendMessage(
  sessionId: string,
  text: string
): z.infer<typeof ChatSendMessageSchema> {
  return { type: 'chat.send', sessionId, text };
}

export function createApprovalRespondMessage(
  approvalId: string,
  decision: ApprovalDecision
): z.infer<typeof ApprovalRespondMessageSchema> {
  return { type: 'approval.respond', approvalId, decision };
}
