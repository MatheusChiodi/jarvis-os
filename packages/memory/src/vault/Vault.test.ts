import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Vault } from './vault/Vault';
import { initSql } from './vault/Vault';
import type { Note, NoteType } from '@jarvis-os/core';

describe('Memory Layer - Vault', () => {
  let vault: Vault;
  const projectId = 'test-project';

  beforeAll(async () => {
    await initSql();
    vault = await Vault.open(projectId);
  });

  afterAll(() => {
    vault.close();
  });

  describe('saveNote', () => {
    it('should save a new note', async () => {
      const note: Omit<Note, 'path'> = {
        frontmatter: {
          id: 'test-note-1',
          type: 'memory',
          title: 'Test Note',
          summary: 'A test note for memory layer',
          tags: ['test', 'memory'],
          agent: 'planner',
          project: projectId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wikilinks: [],
          pinned: false,
          archived: false,
        },
        content: '# Test Note\n\nThis is a test note content.',
      };

      const saved = vault.saveNote(note);
      expect(saved.frontmatter.id).toBe('test-note-1');
      expect(saved.frontmatter.title).toBe('Test Note');
      expect(saved.content).toBe('# Test Note\n\nThis is a test note content.');
    });

    it('should update an existing note', async () => {
      const note: Omit<Note, 'path'> = {
        frontmatter: {
          id: 'test-note-2',
          type: 'memory',
          title: 'Original Title',
          summary: 'Original summary',
          tags: ['test'],
          agent: 'planner',
          project: projectId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wikilinks: [],
          pinned: false,
          archived: false,
        },
        content: 'Original content',
      };

      vault.saveNote(note);

      const updated: Omit<Note, 'path'> = {
        ...note,
        frontmatter: { ...note.frontmatter, title: 'Updated Title' },
        content: 'Updated content',
      };

      const saved = vault.saveNote(updated);
      expect(saved.frontmatter.title).toBe('Updated Title');
      expect(saved.content).toBe('Updated content');
    });
  });

  describe('getNote', () => {
    it('should retrieve a note by ID', async () => {
      const note = vault.getNote('test-note-1');
      expect(note).not.toBeNull();
      expect(note?.frontmatter.id).toBe('test-note-1');
      expect(note?.frontmatter.title).toBe('Test Note');
    });

    it('should return null for non-existent note', async () => {
      const note = vault.getNote('non-existent-id');
      expect(note).toBeNull();
    });
  });

  describe('listNotes', () => {
    it('should list notes with filters', async () => {
      const notes = vault.listNotes({ type: 'memory', limit: 10 });
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every(n => n.frontmatter.type === 'memory')).toBe(true);
    });

    it('should filter by agent', async () => {
      const notes = vault.listNotes({ agent: 'planner', limit: 10 });
      expect(notes.every(n => n.frontmatter.agent === 'planner')).toBe(true);
    });

    it('should filter by tag', async () => {
      const notes = vault.listNotes({ tag: 'test', limit: 10 });
      expect(notes.every(n => n.frontmatter.tags.includes('test'))).toBe(true);
    });
  });

  describe('searchNotes', () => {
    it('should find notes by keyword', async () => {
      const results = vault.searchNotes('test note', 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].note.frontmatter.title).toContain('Test');
    });

    it('should return empty array for no matches', async () => {
      const results = vault.searchNotes('nonexistentkeyword123', 10);
      expect(results.length).toBe(0);
    });
  });

  describe('archiveNote', () => {
    it('should archive a note', async () => {
      const result = vault.archiveNote('test-note-1');
      expect(result).toBe(true);

      const note = vault.getNote('test-note-1');
      expect(note?.frontmatter.archived).toBe(true);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      // First create a note to delete
      const note: Omit<Note, 'path'> = {
        frontmatter: {
          id: 'note-to-delete',
          type: 'memory',
          title: 'Delete Me',
          summary: 'This note will be deleted',
          tags: ['delete'],
          agent: 'planner',
          project: projectId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wikilinks: [],
          pinned: false,
          archived: false,
        },
        content: 'Content to delete',
      };
      vault.saveNote(note);

      // Verify it exists
      expect(vault.getNote('note-to-delete')).not.toBeNull();

      // Delete it
      const result = vault.deleteNote('note-to-delete');
      expect(result).toBe(true);

      // Verify it's gone
      expect(vault.getNote('note-to-delete')).toBeNull();
    });
  });
});

describe('Memory Layer - Vector Index', () => {
  it('should initialize vector index', async () => {
    const { initVectorIndex } = await import('./search/VectorIndex');
    await expect(initVectorIndex()).resolves.not.toThrow();
  });
});

describe('Memory Layer - Hooks', () => {
  it('should have default hooks registered', async () => {
    const { defaultHookRegistry } = await import('./hooks/Hooks');
    const hooks = defaultHookRegistry.getRegisteredHooks();
    expect(hooks).toContain('taskCompleted');
    expect(hooks).toContain('teammateIdle');
  });

  it('should execute taskCompleted hook', async () => {
    const { defaultHookRegistry, HookContext } = await import('./hooks/Hooks');
    
    // Mock vault
    const mockVault = {
      listNotes: vi.fn(() => []),
      saveNote: vi.fn((note) => note),
    };

    const context = {
      vault: mockVault,
      projectId: 'test-project',
      agentId: 'planner',
      taskId: 'task-123',
    };

    const result = await defaultHookRegistry.execute('taskCompleted', context);
    expect(result).not.toBeNull();
    expect(result?.frontmatter.type).toBe('learning');
    expect(result?.frontmatter.taskId).toBe('task-123');
  });
});