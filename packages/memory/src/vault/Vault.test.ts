import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sql.js before importing Vault
const mockDb = {
  exec: vi.fn(),
  prepare: vi.fn(() => ({
    run: vi.fn(),
    bind: vi.fn(),
    step: vi.fn().mockReturnValue(false),
    getAsObject: vi.fn(),
    free: vi.fn(),
  })),
  close: vi.fn(),
  export: vi.fn().mockReturnValue(new Uint8Array()),
};

vi.mock('sql.js', () => ({
  default: vi.fn().mockResolvedValue({
    Database: vi.fn(() => mockDb),
  }),
  Database: vi.fn(() => mockDb),
}));

import { MIGRATIONS, SCHEMA_VERSION } from './Schema';
import {
  archiveNote,
  closeVault,
  createVault,
  deleteNote,
  getBacklinks,
  getGraph,
  getHookState,
  getNote,
  getObservations,
  getTimeline,
  listNotes,
  saveNote,
  searchIndex,
  setHookState,
} from './Vault';

describe('Schema', () => {
  it('should have correct schema version', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('should have migrations array', () => {
    expect(MIGRATIONS).toBeDefined();
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it('migrations should create all required tables', () => {
    const migration = MIGRATIONS[0];
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS projects');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS notes');
    expect(migration).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS note_embeddings');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS hook_state');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS schema_version');
  });

  it('should have triggers for FTS5 sync', () => {
    const migration = MIGRATIONS[0];
    expect(migration).toContain('notes_fts_insert');
    expect(migration).toContain('notes_fts_update');
    expect(migration).toContain('notes_fts_delete');
  });

  it('should have indexes for common queries', () => {
    const migration = MIGRATIONS[0];
    expect(migration).toContain('idx_notes_project_id');
    expect(migration).toContain('idx_notes_type');
    expect(migration).toContain('idx_notes_agent');
    expect(migration).toContain('idx_notes_task_id');
    expect(migration).toContain('idx_notes_created_at');
  });
});

describe('Vault', () => {
  let vault: Awaited<ReturnType<typeof createVault>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: vi.fn().mockReturnValue(false),
      getAsObject: vi.fn(),
      free: vi.fn(),
    });
    mockDb.exec.mockReturnValue([]);
    mockDb.close.mockReturnValue(undefined);
    mockDb.export.mockReturnValue(new Uint8Array());

    vault = await createVault({
      projectId: 'test-project',
      projectName: 'Test Project',
      projectPath: '/tmp/test-project',
    });
  });

  afterEach(() => {
    closeVault(vault);
  });

  it('should initialize vault with schema', async () => {
    expect(vault.initialized).toBe(true);
    expect(vault.projectId).toBe('test-project');
    expect(vault.db).toBeDefined();
  });

  it('should save and retrieve a note', async () => {
    const mockStep = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObject = vi.fn().mockReturnValue({
      id: 'note-1',
      project_id: 'test-project',
      type: 'memory',
      title: 'Test Note',
      summary: 'A test note',
      content: '# Test Note\n\nThis is a test note.',
      tags: JSON.stringify(['test', 'memory']),
      agent: 'test-agent',
      task_id: null,
      wikilinks: JSON.stringify([]),
      pinned: 0,
      archived: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: 'note-1.md',
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    const note = await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Test Note',
        summary: 'A test note',
        tags: ['test', 'memory'],
        agent: 'test-agent',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: '# Test Note\n\nThis is a test note.',
    });

    expect(note.frontmatter.id).toBe('note-1');
    expect(note.frontmatter.title).toBe('Test Note');
    expect(note.path).toBe('note-1.md');

    const retrieved = await getNote(vault, 'note-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.frontmatter.title).toBe('Test Note');
    expect(retrieved?.content).toBe('# Test Note\n\nThis is a test note.');
  });

  it('should list notes with filters', async () => {
    const mockStep = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const mockGetAsObject = vi
      .fn()
      .mockReturnValueOnce({
        id: 'note-1',
        project_id: 'test-project',
        type: 'memory',
        title: 'Memory Note',
        summary: 'A memory note',
        content: 'Memory content',
        tags: JSON.stringify(['test']),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-1.md',
      })
      .mockReturnValueOnce({
        id: 'note-2',
        project_id: 'test-project',
        type: 'decision',
        title: 'Decision Note',
        summary: 'A decision note',
        content: 'Decision content',
        tags: JSON.stringify(['test']),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-2.md',
      });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Memory Note',
        summary: 'A memory note',
        tags: ['test'],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Memory content',
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-2',
        type: 'decision',
        title: 'Decision Note',
        summary: 'A decision note',
        tags: ['test'],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Decision content',
    });

    const allNotes = await listNotes(vault, {});
    expect(allNotes.length).toBe(2);

    const memoryNotes = await listNotes(vault, { type: 'memory' });
    expect(memoryNotes.length).toBe(1);
    expect(memoryNotes[0].frontmatter.type).toBe('memory');

    const decisionNotes = await listNotes(vault, { type: 'decision' });
    expect(decisionNotes.length).toBe(1);
    expect(decisionNotes[0].frontmatter.type).toBe('decision');
  });

  it('should archive and unarchive notes', async () => {
    const mockStep = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObject = vi.fn().mockReturnValue({
      id: 'note-1',
      project_id: 'test-project',
      type: 'memory',
      title: 'Test Note',
      summary: 'A test note',
      content: 'Content',
      tags: JSON.stringify([]),
      agent: 'test-agent',
      task_id: null,
      wikilinks: JSON.stringify([]),
      pinned: 0,
      archived: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: 'note-1.md',
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    const note = await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Test Note',
        summary: 'A test note',
        tags: [],
        agent: 'test-agent',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Content',
    });

    expect(note.frontmatter.archived).toBe(false);

    await archiveNote(vault, 'note-1');

    const mockStepArchived = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObjectArchived = vi.fn().mockReturnValue({
      id: 'note-1',
      project_id: 'test-project',
      type: 'memory',
      title: 'Test Note',
      summary: 'A test note',
      content: 'Content',
      tags: JSON.stringify([]),
      agent: 'test-agent',
      task_id: null,
      wikilinks: JSON.stringify([]),
      pinned: 0,
      archived: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: 'note-1.md',
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStepArchived,
      getAsObject: mockGetAsObjectArchived,
      free: vi.fn(),
    });

    const archivedNotes = await listNotes(vault, { archived: true });
    expect(archivedNotes.length).toBe(1);
    expect(archivedNotes[0].frontmatter.archived).toBe(true);

    const mockStepActive = vi.fn().mockReturnValue(false);
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStepActive,
      getAsObject: vi.fn(),
      free: vi.fn(),
    });

    const activeNotes = await listNotes(vault, { archived: false });
    expect(activeNotes.length).toBe(0);
  });

  it('should delete notes', async () => {
    const mockStep = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObject = vi.fn().mockReturnValue({
      id: 'note-1',
      project_id: 'test-project',
      type: 'memory',
      title: 'Test Note',
      summary: 'A test note',
      content: 'Content',
      tags: JSON.stringify([]),
      agent: 'test-agent',
      task_id: null,
      wikilinks: JSON.stringify([]),
      pinned: 0,
      archived: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      path: 'note-1.md',
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Test Note',
        summary: 'A test note',
        tags: [],
        agent: 'test-agent',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Content',
    });

    const mockStepDelete = vi.fn().mockReturnValue(false);
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStepDelete,
      getAsObject: vi.fn(),
      free: vi.fn(),
    });

    await deleteNote(vault, 'note-1');

    const mockStepAfterDelete = vi.fn().mockReturnValue(false);
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStepAfterDelete,
      getAsObject: vi.fn(),
      free: vi.fn(),
    });

    const notes = await listNotes(vault, { archived: true });
    expect(notes.length).toBe(0);
  });

  it('should search notes using FTS5', async () => {
    const mockStep = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const mockGetAsObject = vi
      .fn()
      .mockReturnValueOnce({
        id: 'note-1',
        project_id: 'test-project',
        type: 'memory',
        title: 'Authentication Bug',
        summary: 'Bug in authentication flow',
        content: 'The authentication flow has a bug when handling expired tokens.',
        tags: JSON.stringify(['bug', 'auth']),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        score: 1.5,
      })
      .mockReturnValueOnce({
        id: 'note-2',
        project_id: 'test-project',
        type: 'decision',
        title: 'OAuth2 Implementation',
        summary: 'Decided to use OAuth2 for authentication',
        content: 'We will implement OAuth2 for secure authentication.',
        tags: JSON.stringify(['decision', 'auth']),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        score: 2.0,
      });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Authentication Bug',
        summary: 'Bug in authentication flow',
        tags: ['bug', 'auth'],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'The authentication flow has a bug when handling expired tokens.',
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-2',
        type: 'decision',
        title: 'OAuth2 Implementation',
        summary: 'Decided to use OAuth2 for authentication',
        tags: ['decision', 'auth'],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'We will implement OAuth2 for secure authentication.',
    });

    const results = await searchIndex(vault, { query: 'authentication', limit: 10 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title.includes('Authentication'))).toBe(true);
  });

  it('should get timeline around a date', async () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const mockStep = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObject = vi.fn().mockReturnValue({
      id: 'note-1',
      project_id: 'test-project',
      type: 'memory',
      title: 'Yesterday Note',
      summary: 'Note from yesterday',
      content: 'Yesterday content',
      tags: JSON.stringify([]),
      agent: 'agent-1',
      task_id: null,
      wikilinks: JSON.stringify([]),
      pinned: 0,
      archived: 0,
      created_at: yesterday.toISOString(),
      updated_at: yesterday.toISOString(),
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Yesterday Note',
        summary: 'Note from yesterday',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: yesterday.toISOString(),
        updatedAt: yesterday.toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Yesterday content',
    });

    const timeline = await getTimeline(vault, now.toISOString(), 2);
    expect(timeline.length).toBeGreaterThan(0);

    const found = timeline.some((event) =>
      event.notes.some((note) => note.title === 'Yesterday Note')
    );
    expect(found).toBe(true);
  });

  it('should get observations by IDs', async () => {
    const mockStep = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const mockGetAsObject = vi
      .fn()
      .mockReturnValueOnce({
        id: 'note-1',
        project_id: 'test-project',
        type: 'memory',
        title: 'Note 1',
        summary: 'First note',
        content: 'Content 1',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-1.md',
      })
      .mockReturnValueOnce({
        id: 'note-2',
        project_id: 'test-project',
        type: 'memory',
        title: 'Note 2',
        summary: 'Second note',
        content: 'Content 2',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify(['Note 1']),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-2.md',
      });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    const _note1 = await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Note 1',
        summary: 'First note',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Content 1',
    });

    const _note2 = await saveNote(vault, {
      frontmatter: {
        id: 'note-2',
        type: 'memory',
        title: 'Note 2',
        summary: 'Second note',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: ['Note 1'],
        pinned: false,
        archived: false,
      },
      content: 'Content 2',
    });

    const observations = await getObservations(vault, ['note-1', 'note-2']);
    expect(observations.length).toBe(2);
    expect(observations[0].relatedNotes).toBeDefined();
  });

  it('should get backlinks', async () => {
    const mockStep = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const mockGetAsObject = vi
      .fn()
      .mockReturnValueOnce({
        id: 'note-1',
        project_id: 'test-project',
        type: 'memory',
        title: 'Target Note',
        summary: 'Target note',
        content: 'Target content',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify([]),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-1.md',
      })
      .mockReturnValueOnce({
        id: 'note-2',
        project_id: 'test-project',
        type: 'memory',
        title: 'Source Note',
        summary: 'Source note linking to target',
        content: 'Source content [[Target Note]]',
        tags: JSON.stringify([]),
        agent: 'agent-1',
        task_id: null,
        wikilinks: JSON.stringify(['Target Note']),
        pinned: 0,
        archived: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        path: 'note-2.md',
      });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Target Note',
        summary: 'Target note',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Target content',
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-2',
        type: 'memory',
        title: 'Source Note',
        summary: 'Source note linking to target',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: ['Target Note'],
        pinned: false,
        archived: false,
      },
      content: 'Source content [[Target Note]]',
    });

    const backlinks = await getBacklinks(vault, 'Target Note');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].frontmatter.title).toBe('Source Note');
  });

  it('should get graph', async () => {
    const mockStep = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const mockGetAsObject = vi
      .fn()
      .mockReturnValueOnce({
        id: 'note-1',
        title: 'Note 1',
        type: 'memory',
        wikilinks: JSON.stringify(['Note 2']),
      })
      .mockReturnValueOnce({
        id: 'note-2',
        title: 'Note 2',
        type: 'memory',
        wikilinks: JSON.stringify([]),
      });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-1',
        type: 'memory',
        title: 'Note 1',
        summary: 'First note',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: ['Note 2'],
        pinned: false,
        archived: false,
      },
      content: 'Content 1 [[Note 2]]',
    });

    await saveNote(vault, {
      frontmatter: {
        id: 'note-2',
        type: 'memory',
        title: 'Note 2',
        summary: 'Second note',
        tags: [],
        agent: 'agent-1',
        project: 'test-project',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: 'Content 2',
    });

    const graph = await getGraph(vault);
    expect(graph.nodes.length).toBe(2);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].from).toBe('note-1');
    expect(graph.edges[0].to).toBe('Note 2');
  });

  it('should handle hook state', async () => {
    const mockStep = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    const mockGetAsObject = vi.fn().mockReturnValue({
      id: 'hook-1',
      project_id: 'test-project',
      hook_type: 'testHook',
      agent_id: 'agent-1',
      task_id: 'task-1',
      state: JSON.stringify({ key: 'value' }),
      last_triggered_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    mockDb.prepare.mockReturnValue({
      run: vi.fn(),
      bind: vi.fn(),
      step: mockStep,
      getAsObject: mockGetAsObject,
      free: vi.fn(),
    });

    await setHookState(vault, 'testHook', 'agent-1', { key: 'value' }, 'task-1');
    const state = await getHookState(vault, 'testHook', 'agent-1');

    expect(state).not.toBeNull();
    expect(state?.hook_type).toBe('testHook');
    expect(state?.agent_id).toBe('agent-1');
    expect(JSON.parse(state?.state)).toEqual({ key: 'value' });
  });
});

describe('Vault Error Handling', () => {
  it('should throw error when vault not initialized', async () => {
    const mockUninitializedVault = {
      projectId: 'test',
      path: '/tmp/test',
      db: mockDb,
      sqlJs: { Database: vi.fn(() => mockDb) },
      initialized: false,
    };

    await expect(
      saveNote(mockUninitializedVault as any, {
        frontmatter: {
          id: 'note-1',
          type: 'memory',
          title: 'Test',
          summary: 'Test',
          tags: [],
          agent: 'agent-1',
          project: 'test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          wikilinks: [],
          pinned: false,
          archived: false,
        },
        content: 'Test',
      })
    ).rejects.toThrow('Vault not initialized');
  });
});
