import { describe, expect, it } from 'vitest';
import {
  AgentStateSchema,
  ToolRiskSchema,
  ApprovalDecisionSchema,
  ErrorCodeSchema,
  ClientMessageSchema,
  DaemonMessageSchema,
  ConfigSchema,
  ProviderConfigSchema,
  DaemonConfigSchema,
  RoutesConfigSchema,
  AgentConfigSchema,
  SessionSchema,
  MessageSchema,
  ApprovalSchema,
  ToolSchema,
  validateClientMessage,
  validateDaemonMessage,
  validateConfig,
  createAuthMessage,
  createSessionCreateMessage,
  createChatSendMessage,
  createApprovalRespondMessage,
} from './index';

describe('protocol', () => {
  describe('base schemas', () => {
    it('AgentStateSchema parses valid states', () => {
      expect(AgentStateSchema.parse('idle')).toBe('idle');
      expect(AgentStateSchema.parse('running-tool')).toBe('running-tool');
      expect(AgentStateSchema.parse('error')).toBe('error');
    });

    it('AgentStateSchema rejects invalid states', () => {
      expect(() => AgentStateSchema.parse('invalid')).toThrow();
    });

    it('ToolRiskSchema parses valid risks', () => {
      expect(ToolRiskSchema.parse('safe')).toBe('safe');
      expect(ToolRiskSchema.parse('write')).toBe('write');
      expect(ToolRiskSchema.parse('dangerous')).toBe('dangerous');
    });

    it('ApprovalDecisionSchema parses valid decisions', () => {
      expect(ApprovalDecisionSchema.parse('approve')).toBe('approve');
      expect(ApprovalDecisionSchema.parse('deny')).toBe('deny');
    });

    it('ErrorCodeSchema parses valid codes', () => {
      expect(ErrorCodeSchema.parse('UNAUTHORIZED')).toBe('UNAUTHORIZED');
      expect(ErrorCodeSchema.parse('BAD_REQUEST')).toBe('BAD_REQUEST');
      expect(ErrorCodeSchema.parse('INTERNAL')).toBe('INTERNAL');
    });
  });

  describe('ClientMessageSchema', () => {
    it('parses auth message', () => {
      const msg = { type: 'auth', token: 'test-token' };
      const result = ClientMessageSchema.parse(msg);
      expect(result.type).toBe('auth');
      expect(result.token).toBe('test-token');
    });

    it('parses session.create message', () => {
      const msg = { type: 'session.create', title: 'Test Session' };
      const result = ClientMessageSchema.parse(msg);
      expect(result.type).toBe('session.create');
      expect(result.title).toBe('Test Session');
    });

    it('parses chat.send message', () => {
      const msg = { type: 'chat.send', sessionId: 'sess-1', text: 'Hello' };
      const result = ClientMessageSchema.parse(msg);
      expect(result.type).toBe('chat.send');
      expect(result.sessionId).toBe('sess-1');
      expect(result.text).toBe('Hello');
    });

    it('parses approval.respond message', () => {
      const msg = { type: 'approval.respond', approvalId: 'app-1', decision: 'approve' };
      const result = ClientMessageSchema.parse(msg);
      expect(result.type).toBe('approval.respond');
      expect(result.decision).toBe('approve');
    });

    it('rejects invalid message type', () => {
      expect(() => ClientMessageSchema.parse({ type: 'invalid' })).toThrow();
    });
  });

  describe('DaemonMessageSchema', () => {
    it('parses agent.state message', () => {
      const msg = {
        type: 'agent.state',
        agentId: 'agent-1',
        state: 'idle',
        ts: '2024-01-01T00:00:00.000Z',
      };
      const result = DaemonMessageSchema.parse(msg);
      expect(result.type).toBe('agent.state');
      expect(result.agentId).toBe('agent-1');
    });

    it('parses message.delta message', () => {
      const msg = {
        type: 'message.delta',
        messageId: 'msg-1',
        text: 'Hello',
        ts: '2024-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
      };
      const result = DaemonMessageSchema.parse(msg);
      expect(result.type).toBe('message.delta');
    });

    it('parses tool.started message', () => {
      const msg = {
        type: 'tool.started',
        callId: 'call-1',
        tool: 'fs_read',
        args: { path: '/test' },
        risk: 'safe',
        ts: '2024-01-01T00:00:00.000Z',
        sessionId: 'sess-1',
      };
      const result = DaemonMessageSchema.parse(msg);
      expect(result.type).toBe('tool.started');
      expect(result.risk).toBe('safe');
    });

    it('parses error message', () => {
      const msg = {
        type: 'error',
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        ts: '2024-01-01T00:00:00.000Z',
      };
      const result = DaemonMessageSchema.parse(msg);
      expect(result.type).toBe('error');
      expect(result.code).toBe('BAD_REQUEST');
    });
  });

  describe('ConfigSchema', () => {
    it('parses valid config', () => {
      const config = {
        daemon: { host: '127.0.0.1', port: 47800 },
        providers: [{ id: 'test', baseUrl: 'http://localhost:8080', apiKeyEnv: 'TEST_KEY' }],
        routes: { default: ['test:model'] },
        workspaces: ['/home/user'],
        agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
      };
      const result = ConfigSchema.parse(config);
      expect(result.daemon.port).toBe(47800);
      expect(result.providers).toHaveLength(1);
    });

    it('rejects invalid daemon host', () => {
      const config = {
        daemon: { host: 'invalid', port: 47800 },
        providers: [],
        routes: { default: [] },
        workspaces: [],
        agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
      };
      expect(() => ConfigSchema.parse(config)).toThrow();
    });

    it('rejects invalid port', () => {
      const config = {
        daemon: { host: '127.0.0.1', port: 70000 },
        providers: [],
        routes: { default: [] },
        workspaces: [],
        agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
      };
      expect(() => ConfigSchema.parse(config)).toThrow();
    });
  });

  describe('utility functions', () => {
    it('validateClientMessage parses valid auth', () => {
      const result = validateClientMessage({ type: 'auth', token: 'test' });
      expect(result.type).toBe('auth');
    });

    it('validateDaemonMessage parses valid state', () => {
      const result = validateDaemonMessage({
        type: 'agent.state',
        agentId: 'a1',
        state: 'idle',
        ts: '2024-01-01T00:00:00.000Z',
      });
      expect(result.type).toBe('agent.state');
    });

    it('validateConfig parses valid config', () => {
      const config = {
        daemon: { host: '127.0.0.1', port: 47800 },
        providers: [],
        routes: { default: [] },
        workspaces: ['/home'],
        agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
      };
      const result = validateConfig(config);
      expect(result.daemon.host).toBe('127.0.0.1');
    });

    it('createAuthMessage creates valid message', () => {
      const msg = createAuthMessage('my-token');
      expect(msg.type).toBe('auth');
      expect(msg.token).toBe('my-token');
    });

    it('createSessionCreateMessage creates valid message', () => {
      const msg = createSessionCreateMessage('My Session');
      expect(msg.type).toBe('session.create');
      expect(msg.title).toBe('My Session');
    });

    it('createChatSendMessage creates valid message', () => {
      const msg = createChatSendMessage('sess-1', 'Hello world');
      expect(msg.type).toBe('chat.send');
      expect(msg.sessionId).toBe('sess-1');
      expect(msg.text).toBe('Hello world');
    });

    it('createApprovalRespondMessage creates valid message', () => {
      const msg = createApprovalRespondMessage('app-1', 'approve');
      expect(msg.type).toBe('approval.respond');
      expect(msg.approvalId).toBe('app-1');
      expect(msg.decision).toBe('approve');
    });
  });
});