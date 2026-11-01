import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import { config } from '../config.js';
import { getDb } from '../database.js';
import { sessions } from './state.js';

export async function createSession(title?: string): Promise<any> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    title || 'New Session',
    now,
    now
  );

  const { createVault } = await import('@jarvis-os/memory');
  const vault = await createVault({
    projectId: 'default',
    projectName: 'Default',
    projectPath: config.workspaces[0] || process.cwd(),
  });

  let vectorIndex: any;
  let progressiveDisclosure: any;
  try {
    const { createVectorIndex } = await import('@jarvis-os/memory');
    const { createProgressiveDisclosure } = await import('@jarvis-os/memory');
    vectorIndex = await createVectorIndex({ projectId: 'default', vault });
    progressiveDisclosure = createProgressiveDisclosure({ vault, vectorIndex });
  } catch (e) {
    console.warn('Vector index not available:', e);
  }

  const session = {
    sessionId: id,
    vault,
    vectorIndex,
    progressiveDisclosure,
    currentTurn: null,
    wsConnections: new Set<WebSocket>(),
  };

  sessions.set(id, session);

  return { id, title: title || 'New Session', createdAt: now, updatedAt: now };
}

export function getSession(sessionId: string): any {
  return sessions.get(sessionId);
}

export function listSessions(): any[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getHistory(sessionId: string): any[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as any[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls as string) as any[]) : undefined,
    toolCallId: r.tool_call_id || undefined,
    model: r.model || undefined,
    promptTokens: r.prompt_tokens || undefined,
    completionTokens: r.completion_tokens || undefined,
    createdAt: r.created_at,
  }));
}

export function getSessionById(sessionId: string): any {
  return sessions.get(sessionId);
}
