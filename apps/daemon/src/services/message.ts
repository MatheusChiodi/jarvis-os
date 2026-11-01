import { getDb } from '../database.js';

export function saveMessage(sessionId: string, message: any): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, tool_calls, tool_call_id, model, prompt_tokens, completion_tokens, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    sessionId,
    message.role,
    message.content,
    message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    message.toolCallId || null,
    message.model || null,
    message.promptTokens || null,
    message.completionTokens || null,
    message.createdAt
  );
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), sessionId);
}