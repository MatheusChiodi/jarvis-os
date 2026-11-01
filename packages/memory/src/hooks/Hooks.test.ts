import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vault, Note } from '../vault/Vault';
import {
  type HookContext,
  builtInHooks,
  onCommunicationSent,
  onDecisionMade,
  onTaskCompleted,
  onTaskStarted,
  onTeammateIdle,
} from './Hooks';

const createMockStmt = () => ({
  run: vi.fn(),
  bind: vi.fn(),
  step: vi.fn().mockReturnValue(false),
  getAsObject: vi.fn(),
  free: vi.fn(),
});

const mockDb = {
  prepare: vi.fn(() => createMockStmt()),
  exec: vi.fn(),
  close: vi.fn(),
  export: vi.fn().mockReturnValue(new Uint8Array()),
};

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: mockDb as any,
  sqlJs: {} as any,
  initialized: true,
};

const mockContext: HookContext = {
  vault: mockVault,
  projectId: 'test-project',
  agentId: 'agent-1',
  taskId: 'task-1',
};

describe('Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue(createMockStmt());
  });

  describe('onTaskCompleted', () => {
    it('should return success when disabled', async () => {
      const result = await onTaskCompleted({ ...mockContext, taskId: undefined });
      expect(result.success).toBe(true);
    });

    it('should create learning note when task completed', async () => {
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(false);
      mockDb.prepare.mockReturnValue(stmt);

      const saveStmt = createMockStmt();
      saveStmt.run.mockReturnValue(undefined);
      mockDb.prepare.mockReturnValueOnce(saveStmt);

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('learning');
      expect(result.note?.frontmatter.taskId).toBe('task-1');
      expect(result.note?.frontmatter.agent).toBe('agent-1');
    });

    it('should not create note if learning note already exists', async () => {
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(true).mockReturnValueOnce(false);
      stmt.getAsObject.mockReturnValueOnce({
        id: 'existing-note',
        project_id: 'test-project',
        type: 'learning',
        title: 'Existing Learning',
        summary: 'Existing',
        content: 'Content',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: 'task-1',
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'existing.md',
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(false);
      mockDb.prepare.mockReturnValueOnce(stmt);

      const saveStmt = createMockStmt();
      saveStmt.run.mockImplementation(() => { throw new Error('DB Error'); });
      mockDb.prepare.mockReturnValueOnce(saveStmt);

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DB Error');
    });
  });

  describe('onTeammateIdle', () => {
    it('should create state note when agent idle', async () => {
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(false);
      mockDb.prepare.mockReturnValueOnce(stmt);

      const saveStmt = createMockStmt();
      saveStmt.run.mockReturnValue(undefined);
      mockDb.prepare.mockReturnValueOnce(saveStmt);

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('state');
      expect(result.note?.frontmatter.agent).toBe('agent-1');
      expect(result.note?.frontmatter.pinned).toBe(true);
    });

    it('should not create note if recent state note exists', async () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(true).mockReturnValueOnce(false);
      stmt.getAsObject.mockReturnValueOnce({
        id: 'existing-state',
        project_id: 'test-project',
        type: 'state',
        title: 'Existing State',
        summary: 'Existing',
        content: 'Content',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 1,
        archived: 0,
        created_at: recentDate,
        updated_at: recentDate,
        path: 'existing.md',
      });
      mockDb.prepare.mockReturnValue(stmt);

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const stmt = createMockStmt();
      stmt.step.mockReturnValueOnce(false);
      mockDb.prepare.mockReturnValueOnce(stmt);

      const saveStmt = createMockStmt();
      saveStmt.run.mockImplementation(() => { throw new Error('DB Error'); });
      mockDb.prepare.mockReturnValueOnce(saveStmt);

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DB Error');
    });
  });

  describe('onTaskStarted', () => {
    it('should create state note when task started', async () => {
      const saveStmt = createMockStmt();
      saveStmt.run.mockReturnValue(undefined);
      mockDb.prepare.mockReturnValue(saveStmt);

      const result = await onTaskStarted(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('state');
      expect(result.note?.frontmatter.taskId).toBe('task-1');
      expect(result.note?.frontmatter.title).toContain('Task started');
    });

    it('should handle missing taskId', async () => {
      const result = await onTaskStarted({ ...mockContext, taskId: undefined });
      expect(result.success).toBe(true);
      expect(result.error).toBe('No taskId provided');
    });
  });

  describe('onDecisionMade', () => {
    it('should create decision note', async () => {
      const saveStmt = createMockStmt();
      saveStmt.run.mockReturnValue(undefined);
      mockDb.prepare.mockReturnValue(saveStmt);

      const result = await onDecisionMade(
        mockContext,
        'Use OAuth2',
        'More secure than custom auth'
      );

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('decision');
      expect(result.note?.frontmatter.title).toContain('OAuth2');
      expect(result.note?.frontmatter.pinned).toBe(true);
      expect(result.note?.content).toContain('More secure than custom auth');
    });
  });

  describe('onCommunicationSent', () => {
    it('should create communication note', async () => {
      const saveStmt = createMockStmt();
      saveStmt.run.mockReturnValue(undefined);
      mockDb.prepare.mockReturnValue(saveStmt);

      const result = await onCommunicationSent(
        mockContext,
        'agent-2',
        'Code Review',
        'Please review the PR'
      );

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('communication');
      expect(result.note?.frontmatter.title).toContain('Code Review');
      expect(result.note?.content).toContain('Please review the PR');
      expect(result.note?.frontmatter.tags).toContain('agent-2');
    });
  });

  describe('builtInHooks', () => {
    it('should have all required hooks', () => {
      const hookNames = builtInHooks.map((h) => h.name);
      expect(hookNames).toContain('taskCompleted');
      expect(hookNames).toContain('teammateIdle');
      expect(hookNames).toContain('taskStarted');
      expect(hookNames).toContain('decisionMade');
      expect(hookNames).toContain('communicationSent');
    });

    it('each hook should have name, description, and execute function', () => {
      for (const hook of builtInHooks) {
        expect(hook.name).toBeDefined();
        expect(hook.description).toBeDefined();
        expect(typeof hook.execute).toBe('function');
      }
    });
  });
});
