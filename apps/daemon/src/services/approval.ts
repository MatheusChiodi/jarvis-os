import { getDb } from '../database.js';
import { pendingApprovals } from './state.js';
import crypto from 'node:crypto';

export function createApproval(
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
  reason: string,
  timeoutMs: number
): Promise<'approve' | 'deny'> {
  const approvalId = crypto.randomUUID();
  const now = new Date().toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO approvals (id, session_id, tool, args, reason, decision, created_at, resolved_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)
  `).run(approvalId, sessionId, tool, JSON.stringify(args), reason, now);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingApprovals.delete(approvalId);
      const db = getDb();
      db.prepare('UPDATE approvals SET decision = ?, resolved_at = ? WHERE id = ?')
        .run('denied', new Date().toISOString(), approvalId);
      resolve('deny');
    }, timeoutMs);

    pendingApprovals.set(approvalId, {
      approvalId,
      sessionId,
      tool,
      args,
      reason,
      resolve,
      timeout
    });
  });
}

export function resolveApproval(approvalId: string, decision: 'approve' | 'deny'): void {
  const pending = pendingApprovals.get(approvalId);
  if (!pending) return;

  clearTimeout(pending.timeout);
  pendingApprovals.delete(approvalId);

  const db = getDb();
  db.prepare('UPDATE approvals SET decision = ?, resolved_at = ? WHERE id = ?')
    .run(decision, new Date().toISOString(), approvalId);

  pending.resolve(decision);
}