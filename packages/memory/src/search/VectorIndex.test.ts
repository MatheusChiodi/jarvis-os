import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Vault } from '../vault/Vault';
import {
  VectorIndexError,
  addNote,
  createVectorIndex,
  embedText,
  getCollectionStats,
  removeNote,
  search,
} from './VectorIndex';

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: {} as any,
  sqlJs: {} as any,
  initialized: true,
};

describe('VectorIndex', () => {
  let vectorIndex: Awaited<ReturnType<typeof createVectorIndex>>;

  beforeEach(async () => {
    vectorIndex = await createVectorIndex({
      projectId: 'test-project',
      vault: mockVault,
    });
  });

  afterEach(async () => {
    const { closeIndex } = await import('./VectorIndex');
    await closeIndex(vectorIndex);
  });

  it('should create vector index', () => {
    expect(vectorIndex.initialized).toBe(true);
    expect(vectorIndex.projectId).toBe('test-project');
    expect(vectorIndex.client).toBeDefined();
    expect(vectorIndex.collection).toBeDefined();
  });

  it('should throw error when not initialized', async () => {
    const { addNote } = await import('./VectorIndex');
    const uninitializedIndex = { ...vectorIndex, initialized: false };

    await expect(addNote(uninitializedIndex, 'note-1', 'content', {})).rejects.toThrow(
      VectorIndexError
    );
  });
});

describe('Embeddings', () => {
  it('should embed text', async () => {
    const embedding = await embedText('Hello world');

    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);
  });

  it('should embed multiple texts', async () => {
    const { embedTexts } = await import('./VectorIndex');
    const embeddings = await embedTexts(['Hello world', 'Another text']);

    expect(embeddings.length).toBe(2);
    expect(embeddings[0].length).toBe(384);
    expect(embeddings[1].length).toBe(384);
  });
});

describe('VectorIndex CRUD', () => {
  let vectorIndex: Awaited<ReturnType<typeof createVectorIndex>>;

  beforeEach(async () => {
    vectorIndex = await createVectorIndex({
      projectId: 'test-project',
      vault: mockVault,
    });
  });

  afterEach(async () => {
    const { closeIndex } = await import('./VectorIndex');
    await closeIndex(vectorIndex);
  });

  it('should add a note', async () => {
    await addNote(vectorIndex, 'note-1', 'This is a test note about authentication', {
      type: 'memory',
      agent: 'agent-1',
      title: 'Auth Note',
    });

    const stats = await getCollectionStats(vectorIndex);
    expect(stats.count).toBe(1);
    expect(stats.dimension).toBe(384);
  });

  it('should add notes in batch', async () => {
    const { addNotesBatch } = await import('./VectorIndex');

    await addNotesBatch(vectorIndex, [
      { id: 'note-1', content: 'First note', metadata: { type: 'memory' } },
      { id: 'note-2', content: 'Second note', metadata: { type: 'decision' } },
      { id: 'note-3', content: 'Third note', metadata: { type: 'learning' } },
    ]);

    const stats = await getCollectionStats(vectorIndex);
    expect(stats.count).toBe(3);
  });

  it('should search notes', async () => {
    await addNote(vectorIndex, 'note-1', 'Authentication bug in login flow', {
      type: 'memory',
      agent: 'agent-1',
    });

    await addNote(vectorIndex, 'note-2', 'OAuth2 implementation decision', {
      type: 'decision',
      agent: 'agent-1',
    });

    const results = await search(vectorIndex, {
      query: 'authentication',
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('note-1');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should filter search by type', async () => {
    await addNote(vectorIndex, 'note-1', 'Authentication bug', {
      type: 'memory',
      agent: 'agent-1',
    });

    await addNote(vectorIndex, 'note-2', 'OAuth2 decision', {
      type: 'decision',
      agent: 'agent-1',
    });

    const results = await search(vectorIndex, {
      query: 'auth',
      limit: 5,
      type: 'memory',
    });

    expect(results.length).toBe(1);
    expect(results[0].metadata.type).toBe('memory');
  });

  it('should filter search by agent', async () => {
    await addNote(vectorIndex, 'note-1', 'Auth bug', {
      type: 'memory',
      agent: 'agent-1',
    });

    await addNote(vectorIndex, 'note-2', 'Auth decision', {
      type: 'decision',
      agent: 'agent-2',
    });

    const results = await search(vectorIndex, {
      query: 'auth',
      limit: 5,
      agent: 'agent-1',
    });

    expect(results.length).toBe(1);
    expect(results[0].metadata.agent).toBe('agent-1');
  });

  it('should remove a note', async () => {
    await addNote(vectorIndex, 'note-1', 'Test note', { type: 'memory' });

    let stats = await getCollectionStats(vectorIndex);
    expect(stats.count).toBe(1);

    await removeNote(vectorIndex, 'note-1');

    stats = await getCollectionStats(vectorIndex);
    expect(stats.count).toBe(0);
  });

  it('should update a note', async () => {
    const { updateNote } = await import('./VectorIndex');

    await addNote(vectorIndex, 'note-1', 'Original content', { type: 'memory' });

    await updateNote(vectorIndex, 'note-1', 'Updated content', { type: 'memory', updated: true });

    const results = await search(vectorIndex, { query: 'Updated', limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.updated).toBe(true);
  });
});

describe('Hybrid Search', () => {
  it('should perform hybrid search', async () => {
    const { hybridSearch } = await import('./VectorIndex');

    const vault = { ...mockVault, projectId: 'test-project' };
    const vectorIndex = await createVectorIndex({ projectId: 'test-project', vault });

    await addNote(vectorIndex, 'note-1', 'Authentication bug in login', {
      type: 'memory',
      title: 'Auth Bug',
    });
    await addNote(vectorIndex, 'note-2', 'OAuth2 decision made', {
      type: 'decision',
      title: 'OAuth2 Decision',
    });

    const results = await hybridSearch(vault, vectorIndex, 'authentication', 10);

    expect(results.length).toBeGreaterThan(0);

    await closeIndex(vectorIndex);
  });
});

describe('Error Handling', () => {
  it('should throw VectorIndexError with code', async () => {
    const uninitializedIndex = { ...mockVault, initialized: false };

    try {
      await search(uninitializedIndex as any, { query: 'test' });
    } catch (error) {
      expect(error).toBeInstanceOf(VectorIndexError);
      expect((error as VectorIndexError).code).toBe('NOT_INITIALIZED');
    }
  });
});
