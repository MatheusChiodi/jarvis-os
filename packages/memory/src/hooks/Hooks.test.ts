import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vault } from '../vault/Vault';
import {
  type HookContext,
  builtInHooks,
  onCommunicationSent,
  onDecisionMade,
  onTaskCompleted,
  onTaskStarted,
  onTeammateIdle,
} from './Hooks';

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: {} as any,
  sqlJs: {} as any,
  initialized: true,
  listNotes: vi.fn(),
  saveNote: vi.fn(),
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
    mockVault.listNotes = vi.fn().mockResolvedValue([]);
    mockVault.saveNote = vi.fn().mockImplementation(async (note: any) => note);
  });

  describe('onTaskCompleted', () => {
    it('should return success when disabled', async () => {
      // The config is internal, so we test the behavior
      const result = await onTaskCompleted({ ...mockContext, taskId: undefined });
      expect(result.success).toBe(true);
    });

    it('should create learning note when task completed', async () => {
      mockVault.listNotes = vi.fn().mockResolvedValue([]);
      mockVault.saveNote = vi
        .fn()
        .mockImplementation(async (note: any) => ({ ...note, path: `${note.frontmatter.id}.md` }));

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('learning');
      expect(result.note?.frontmatter.taskId).toBe('task-1');
      expect(result.note?.frontmatter.agent).toBe('agent-1');
      expect(mockVault.saveNote).toHaveBeenCalled();
    });

    it('should not create note if learning note already exists', async () => {
      mockVault.listNotes = vi.fn().mockResolvedValue([{ frontmatter: { type: 'learning' } }]);

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeUndefined();
      expect(mockVault.saveNote).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockVault.saveNote = vi.fn().mockRejectedValue(new Error('DB Error'));

      const result = await onTaskCompleted(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DB Error');
    });
  });

  describe('onTeammateIdle', () => {
    it('should create state note when agent idle', async () => {
      mockVault.listNotes = vi.fn().mockResolvedValue([]);
      mockVault.saveNote = vi
        .fn()
        .mockImplementation(async (note: any) => ({ ...note, path: `${note.frontmatter.id}.md` }));

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect(result.note?.frontmatter.type).toBe('state');
      expect(result.note?.frontmatter.agent).toBe('agent-1');
      expect(result.note?.frontmatter.pinned).toBe(true);
      expect(mockVault.saveNote).toHaveBeenCalled();
    });

    it('should not create note if recent state note exists', async () => {
      const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      mockVault.listNotes = vi
        .fn()
        .mockResolvedValue([{ frontmatter: { type: 'state', createdAt: recentDate } }]);

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(true);
      expect(result.note).toBeUndefined();
      expect(mockVault.saveNote).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockVault.saveNote = vi.fn().mockRejectedValue(new Error('DB Error'));

      const result = await onTeammateIdle(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('DB Error');
    });
  });

  describe('onTaskStarted', () => {
    it('should create state note when task started', async () => {
      mockVault.saveNote = vi
        .fn()
        .mockImplementation(async (note: any) => ({ ...note, path: `${note.frontmatter.id}.md` }));

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
      mockVault.saveNote = vi
        .fn()
        .mockImplementation(async (note: any) => ({ ...note, path: `${note.frontmatter.id}.md` }));

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
      mockVault.saveNote = vi
        .fn()
        .mockImplementation(async (note: any) => ({ ...note, path: `${note.frontmatter.id}.md` }));

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
