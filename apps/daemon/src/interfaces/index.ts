import type { WebSocket } from 'ws';

export interface TurnState {
  aborted: boolean;
  abortController: AbortController;
  messageId: string;
  startTime: number;
}

export interface ActiveSession {
  sessionId: string;
  vault: any;
  vectorIndex?: any;
  progressiveDisclosure?: any;
  currentTurn: TurnState | null;
  wsConnections: Set<WebSocket>;
}

export interface PendingApproval {
  approvalId: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  resolve: (result: { approvalId: string; decision: 'approve' | 'deny' }) => void;
  timeout: NodeJS.Timeout;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: any[];
  toolCallId?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  createdAt: string;
}

export interface Approval {
  id: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  decision: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ToolExecutionContext {
  sessionId: string;
  vault: any;
  vectorIndex?: any;
  progressiveDisclosure?: any;
  config: {
    workspaces: string[];
    maxToolOutputChars: number;
  };
}
