import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vault } from '../vault/Vault';
import { ProgressiveDisclosure, createProgressiveDisclosure } from './ProgressiveDisclosure';
import type { VectorIndex } from './VectorIndex';

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: {} as any,
  sqlJs: {} as any,
  initialized: true,
};

const mockVectorIndex: VectorIndex = {
  projectId: 'test-project',
  client: {} as any,
  collection: {} as any,
  initialized: true,
};

describe('ProgressiveDisclosure', () => {
  let disclosure: ProgressiveDisclosure;

  beforeEach(() => {
    disclosure = createProgressiveDisclosure({
      vault: mockVault,
      vectorIndex: mockVectorIndex,
      useVectorSearch: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create progressive disclosure instance', () => {
    expect(disclosure).toBeInstanceOf(ProgressiveDisclosure);
  });

  it('should have searchIndex method', () => {
    expect(typeof disclosure.searchIndex).toBe('function');
  });

  it('should have getTimeline method', () => {
    expect(typeof disclosure.getTimeline).toBe('function');
  });

  it('should have getObservations method', () => {
    expect(typeof disclosure.getObservations).toBe('function');
  });

  it('should have getNote method', () => {
    expect(typeof disclosure.getNote).toBe('function');
  });

  it('should have listNotes method', () => {
    expect(typeof disclosure.listNotes).toBe('function');
  });

  it('should have getRelatedNotes method', () => {
    expect(typeof disclosure.getRelatedNotes).toBe('function');
  });

  it('should have searchByType method', () => {
    expect(typeof disclosure.searchByType).toBe('function');
  });

  it('should have searchByAgent method', () => {
    expect(typeof disclosure.searchByAgent).toBe('function');
  });

  it('should have searchByTag method', () => {
    expect(typeof disclosure.searchByTag).toBe('function');
  });

  it('should have searchByTask method', () => {
    expect(typeof disclosure.searchByTask).toBe('function');
  });

  it('should have getRecentNotes method', () => {
    expect(typeof disclosure.getRecentNotes).toBe('function');
  });

  it('should have getPinnedNotes method', () => {
    expect(typeof disclosure.getPinnedNotes).toBe('function');
  });

  it('should have getStats method', () => {
    expect(typeof disclosure.getStats).toBe('function');
  });

  describe('Layer 1: searchIndex', () => {
    it('should call searchIndex with query and limit', async () => {
      const mockResults = [
        {
          id: '1',
          title: 'Note 1',
          summary: 'Summary 1',
          type: 'memory' as const,
          agent: 'agent-1',
          tags: [],
          createdAt: '2024-01-01',
          score: 0.9,
        },
      ];

      vi.doMock('../vault/Vault', () => ({
        searchIndex: vi.fn().mockResolvedValue(mockResults),
      }));

      const results = await disclosure.searchIndex('test query', 10);
      expect(results).toEqual(mockResults);
    });

    it('should use hybrid search when vector index available', async () => {
      const mockHybridResults = [
        {
          id: '1',
          title: 'Note 1',
          summary: 'Summary 1',
          type: 'memory' as const,
          agent: 'agent-1',
          tags: [],
          createdAt: '2024-01-01',
          score: 0.95,
        },
      ];

      vi.doMock('./VectorIndex', () => ({
        hybridSearch: vi.fn().mockResolvedValue(mockHybridResults),
      }));

      const results = await disclosure.searchIndex('test query', 10);
      expect(results).toEqual(mockHybridResults);
    });
  });

  describe('Layer 2: getTimeline', () => {
    it('should call getTimeline with around date and window', async () => {
      const mockTimeline = [
        {
          timestamp: '2024-01-15',
          notes: [
            {
              id: '1',
              title: 'Note 1',
              summary: 'Summary',
              type: 'memory' as const,
              agent: 'agent-1',
              tags: [],
              createdAt: '2024-01-15',
              score: 0,
            },
          ],
        },
      ];

      vi.doMock('../vault/Vault', () => ({
        getTimeline: vi.fn().mockResolvedValue(mockTimeline),
      }));

      const results = await disclosure.getTimeline('2024-01-15', 7);
      expect(results).toEqual(mockTimeline);
    });
  });

  describe('Layer 3: getObservations', () => {
    it('should call getObservations with IDs', async () => {
      const mockObservations = [
        {
          frontmatter: {
            id: '1',
            type: 'memory' as const,
            title: 'Note 1',
            summary: 'Summary',
            tags: [],
            agent: 'agent-1',
            project: 'test-project',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            wikilinks: [],
            pinned: false,
            archived: false,
          },
          content: 'Content',
          path: '1.md',
          relatedNotes: [],
        },
      ];

      vi.doMock('../vault/Vault', () => ({
        getObservations: vi.fn().mockResolvedValue(mockObservations),
      }));

      const results = await disclosure.getObservations(['1', '2']);
      expect(results).toEqual(mockObservations);
    });
  });

  describe('Utility Methods', () => {
    it('should get stats', async () => {
      const mockStats = {
        totalNotes: 10,
        notesByType: { memory: 5, decision: 3, learning: 2 },
        notesByAgent: { 'agent-1': 6, 'agent-2': 4 },
        totalEmbeddings: 10,
      };

      vi.doMock('../vault/Vault', () => ({
        listNotes: vi
          .fn()
          .mockResolvedValue([
            {
              frontmatter: {
                id: '1',
                type: 'memory',
                title: 'Test',
                summary: 'Test',
                tags: [],
                agent: 'agent-1',
                project: 'test',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01',
                wikilinks: [],
                pinned: false,
                archived: false,
              },
              content: 'Test',
              path: '1.md',
            },
          ]),
      }));

      vi.doMock('./VectorIndex', () => ({
        getCollectionStats: vi.fn().mockResolvedValue({ count: 10, dimension: 384 }),
      }));

      const stats = await disclosure.getStats();
      expect(stats.totalNotes).toBe(10);
      expect(stats.notesByType.memory).toBe(5);
      expect(stats.totalEmbeddings).toBe(10);
    });
  });
});
