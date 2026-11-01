import http from 'node:http';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import pino from 'pino';
import { type WebSocket, WebSocketServer } from 'ws';
import { config, getOrCreateToken, validateToken } from './config.js';
import { closeDb } from './database.js';
import { runAgentTurn } from './services/agent.js';
import { resolveApproval } from './services/approval.js';
import { createSession, getHistory, getSession, listSessions } from './services/session.js';
import { pendingApprovals } from './services/state.js';
import { send } from './websocket.js';
import { z } from 'zod';
import { ClientMessageSchema } from '@jarvis-os/protocol';

const logger = pino({
  name: 'jarvisd',
  level: process.env.JARVIS_LOG_LEVEL || 'info',
  transport: {
    target: 'pino/file',
    options: { destination: resolve(homedir(), '.jarvis-os', 'logs', 'jarvisd.log'), mkdir: true },
  },
  redact: {
    paths: ['*.apiKey', '*.token', 'headers.authorization'],
    censor: '[REDACTED]',
  },
});

const ALLOWED_ORIGINS = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'http://localhost:1420',
]);

// Rate limiting: max 30 messages per 10 seconds per connection
const MESSAGE_LIMIT = 30;
const MESSAGE_WINDOW_MS = 10_000;
const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1 MB

interface AuthenticatedWS extends WebSocket {
  authenticated?: boolean;
  sessionId?: string;
  messageCount: number;
  windowStart: number;
}

interface RateLimitInfo {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<WebSocket, RateLimitInfo>();

function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  const info = rateLimitMap.get(ws) || { count: 0, windowStart: now };
  if (now - info.windowStart > MESSAGE_WINDOW_MS) {
    info.count = 0;
    info.windowStart = now;
  }
  info.count++;
  rateLimitMap.set(ws, info);
  return info.count <= MESSAGE_LIMIT;
}

function validateMessage(data: unknown): { ok: true; message: z.infer<typeof ClientMessageSchema> } | { ok: false; error: string } {
  try {
    const message = ClientMessageSchema.parse(data);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ') };
    }
    return { ok: false, error: String(error) };
  }
}

async function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', version: '0.1.0' }));
}

async function handleWebSocket(ws: AuthenticatedWS, req: http.IncomingMessage): Promise<void> {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    logger.warn({ origin }, 'Rejected connection from unauthorized origin');
    ws.close(4403, 'Unauthorized origin');
    return;
  }

  ws.messageCount = 0;
  ws.windowStart = Date.now();

  const authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      logger.warn('Auth timeout, closing connection');
      ws.close(4401, 'Auth timeout');
    }
  }, 5000);

  ws.on('message', async (data: Buffer) => {
    // Check payload size
    if (data.length > MAX_PAYLOAD_SIZE) {
      logger.warn({ size: data.length }, 'Payload too large');
      ws.close(1009, 'Payload too large');
      return;
    }

    // Rate limiting
    if (!checkRateLimit(ws)) {
      logger.warn('Rate limit exceeded');
      ws.close(1009, 'Rate limit exceeded');
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      // Validate message schema
      const validation = validateMessage(message);
      if (!validation.ok) {
        logger.warn({ error: validation.error }, 'Invalid message schema');
        send(ws, {
          type: 'error',
          code: 'BAD_REQUEST',
          message: validation.error,
          ts: new Date().toISOString(),
        });
        return;
      }

      if (!ws.authenticated) {
        if (validation.message.type === 'auth') {
          if (validateToken(validation.message.token)) {
            ws.authenticated = true;
            clearTimeout(authTimeout);
            logger.info('Client authenticated');

            // Send current agent state and pending approvals
            send(ws, {
              type: 'agent.state',
              agentId: 'jarvis',
              state: 'idle',
              ts: new Date().toISOString(),
            });

            for (const [, approval] of pendingApprovals) {
              send(ws, {
                type: 'approval.requested',
                approvalId: approval.approvalId,
                tool: approval.tool,
                args: approval.args,
                reason: approval.reason,
                ts: new Date().toISOString(),
                sessionId: approval.sessionId,
              });
            }
          } else {
            logger.warn('Invalid token');
            ws.close(4401, 'Invalid token');
          }
        } else {
          logger.warn({ type: validation.message.type }, 'Message before auth');
          ws.close(4401, 'Unauthorized');
        }
        return;
      }

      // Authenticated messages - use validated message
      const msg = validation.message;
      switch (msg.type) {
        case 'session.create': {
          const session = await createSession(msg.title);
          send(ws, { type: 'session.created', session, ts: new Date().toISOString() });
          break;
        }
        case 'session.list': {
          const sessions = listSessions();
          send(ws, { type: 'session.list.result', sessions, ts: new Date().toISOString() });
          break;
        }
        case 'session.history': {
          const messages = getHistory(msg.sessionId);
          send(ws, { type: 'session.history.result', messages, ts: new Date().toISOString() });
          break;
        }
        case 'chat.send': {
          const session = getSession(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'error',
              code: 'BAD_REQUEST',
              message: 'Session not found',
              ts: new Date().toISOString(),
              sessionId: msg.sessionId,
            });
            break;
          }
          if (session.currentTurn) {
            send(ws, {
              type: 'error',
              code: 'BUSY',
              message: 'Session busy with another turn',
              ts: new Date().toISOString(),
              sessionId: msg.sessionId,
            });
            break;
          }
          ws.sessionId = msg.sessionId;
          await runAgentTurn(session, msg.text, ws);
          break;
        }
        case 'chat.cancel': {
          const session = getSession(msg.sessionId);
          if (session?.currentTurn) {
            session.currentTurn.aborted = true;
            session.currentTurn.abortController.abort();
          }
          break;
        }
        case 'approval.respond': {
          resolveApproval(msg.approvalId, msg.decision);
          break;
        }
        default: {
          send(ws, {
            type: 'error',
            code: 'BAD_REQUEST',
            message: `Unknown message type: ${msg.type}`,
            ts: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error handling message');
      send(ws, {
        type: 'error',
        code: 'INTERNAL',
        message: String(error),
        ts: new Date().toISOString(),
      });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    rateLimitMap.delete(ws);
    if (ws.sessionId) {
      const session = getSession(ws.sessionId);
      if (session) {
        session.wsConnections.delete(ws);
      }
    }
  });

  ws.on('error', (error) => {
    logger.error({ error }, 'WebSocket error');
  });
}

export async function startDaemon(
  opts: { port?: number } = {}
): Promise<{ port: number; close(): Promise<void> }> {
  const port = opts.port || config.daemon.port;
  const token = getOrCreateToken();
  logger.info({ token: `${token.slice(0, 8)}...` }, 'Daemon token generated');

  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
      await handleHealth(req, res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  const wss = new WebSocketServer({
    server,
    verifyClient: ({ origin }: { origin: string | undefined }) => {
      if (!origin) return true; // Allow non-browser clients (e.g., curl)
      return ALLOWED_ORIGINS.has(origin);
    },
  });

  wss.on('connection', (ws: AuthenticatedWS, req) => {
    handleWebSocket(ws, req);
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      logger.info({ port }, 'jarvisd listening');
      resolve();
    });
  });

  return {
    port,
    async close() {
      logger.info('Shutting down daemon');
      // Deny all pending approvals
      for (const [approvalId] of pendingApprovals) {
        resolveApproval(approvalId, 'deny');
      }
      wss.close();
      closeDb();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const daemon = await startDaemon({});
  process.on('SIGINT', async () => {
    await daemon.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await daemon.close();
    process.exit(0);
  });
}
