import type { ActiveSession, PendingApproval } from '../interfaces/index.js';

export const sessions = new Map<string, ActiveSession>();
export const pendingApprovals = new Map<string, PendingApproval>();
