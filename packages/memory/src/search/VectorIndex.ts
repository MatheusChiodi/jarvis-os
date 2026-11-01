import type { SearchIndexItem } from '@jarvis-os/core';
import { env, pipeline } from '@xenova/transformers';
import { ChromaClient } from 'chromadb';
import type { Vault } from '../vault/Vault.js';

env.allowLocalModels = true;
env.useBrowserCache = false;

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSION = 384;
const COLLECTION_NAME = 'jarvis-notes';

let embeddingPipelinePromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipelinePromise) {
    embeddingPipelinePromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
      quantized: true,
      progress_callback: (progress: any) => {
        if (progress.status === 'downloading') {
          console.log(`Downloading embedding model: ${Math.round(progress.progress * 100)}%`);
        }
      },
    });
  }
  return embeddingPipelinePromise;
}

export interface VectorIndexConfig {
  projectId: string;
  vault: Vault;
  persistPath?: string;
}

export interface VectorIndex {
  projectId: string;
  client: ChromaClient;
  collection: any;
  initialized: boolean;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  type?: string;
  agent?: string;
  scoreThreshold?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
}

export class VectorIndexError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VectorIndexError';
  }
}

export async function createVectorIndex(config: VectorIndexConfig): Promise<VectorIndex> {
  const client = new ChromaClient({
    path: config.persistPath || ':memory:',
  });

  const collection = await client.getOrCreateCollection({
    name: `${COLLECTION_NAME}_${config.projectId}`,
    metadata: { 'hnsw:space': 'cosine' },
  });

  const index: VectorIndex = {
    projectId: config.projectId,
    client,
    collection,
    initialized: false,
  };

  index.initialized = true;
  return index;
}

export async function openVectorIndex(
  projectId: string,
  persistPath?: string
): Promise<VectorIndex> {
  const client = new ChromaClient({
    path: persistPath || ':memory:',
  });

  const collection = await client.getCollection({
    name: `${COLLECTION_NAME}_${projectId}`,
    embeddingFunction: undefined as any,
  });

  const index: VectorIndex = {
    projectId,
    client,
    collection,
    initialized: true,
  };

  return index;
}

export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data) as Float32Array;
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const pipe = await getEmbeddingPipeline();
  const embeddings: Float32Array[] = [];

  for (const text of texts) {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    embeddings.push(Float32Array.from(output.data) as Float32Array);
  }

  return embeddings;
}

export async function addNote(
  index: VectorIndex,
  noteId: string,
  content: string,
  metadata: Record<string, any>
): Promise<void> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  const embedding = await embedText(content);

  await index.collection.add({
    ids: [noteId],
    embeddings: [Array.from(embedding)],
    metadatas: [metadata],
    documents: [content],
  });
}

export async function addNotesBatch(
  index: VectorIndex,
  notes: Array<{ id: string; content: string; metadata: Record<string, any> }>
): Promise<void> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  if (notes.length === 0) return;

  const texts = notes.map((n) => n.content);
  const embeddings = await embedTexts(texts);

  await index.collection.add({
    ids: notes.map((n) => n.id),
    embeddings: embeddings.map((e) => Array.from(e)),
    metadatas: notes.map((n) => n.metadata),
    documents: notes.map((n) => n.content),
  });
}

export async function updateNote(
  index: VectorIndex,
  noteId: string,
  content: string,
  metadata: Record<string, any>
): Promise<void> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  const embedding = await embedText(content);

  await index.collection.update({
    ids: [noteId],
    embeddings: [Array.from(embedding)],
    metadatas: [metadata],
    documents: [content],
  });
}

export async function removeNote(index: VectorIndex, noteId: string): Promise<void> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  await index.collection.delete({ ids: [noteId] });
}

export async function search(index: VectorIndex, options: SearchOptions): Promise<SearchResult[]> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  const { query, limit = 10, type, agent, scoreThreshold = 0.7 } = options;

  const embedding = await embedText(query);

  const where: Record<string, any> = {};
  if (type) where.type = type;
  if (agent) where.agent = agent;

  const results = await index.collection.query({
    queryEmbeddings: [Array.from(embedding)],
    nResults: limit,
    where: Object.keys(where).length > 0 ? where : undefined,
    include: ['metadatas', 'documents', 'distances'],
  });

  const searchResults: SearchResult[] = [];

  if (results.ids?.[0]) {
    for (let i = 0; i < results.ids[0].length; i++) {
      const distance = results.distances?.[0]?.[i] ?? 1;
      const score = 1 - distance;

      if (score >= scoreThreshold) {
        searchResults.push({
          id: results.ids[0][i],
          score,
          metadata: results.metadatas?.[0]?.[i] || {},
        });
      }
    }
  }

  return searchResults.sort((a, b) => b.score - a.score);
}

export async function hybridSearch(
  vault: Vault,
  vectorIndex: VectorIndex,
  query: string,
  limit = 10,
  ftsWeight = 0.5,
  vectorWeight = 0.5
): Promise<SearchIndexItem[]> {
  const { searchIndex } = await import('../vault/Vault.js');
  const [ftsResults, vectorResults] = await Promise.all([
    searchIndex(vault, { query, limit: limit * 2 }),
    search(vectorIndex, { query, limit: limit * 2 }),
  ]);

  const combined = new Map<
    string,
    { item: SearchIndexItem; ftsScore: number; vectorScore: number }
  >();

  for (const item of ftsResults) {
    const existing = combined.get(item.id);
    const normalizedFts = 1 / (1 + item.score);
    if (existing) {
      existing.ftsScore = Math.max(existing.ftsScore, normalizedFts);
    } else {
      combined.set(item.id, { item, ftsScore: normalizedFts, vectorScore: 0 });
    }
  }

  for (const result of vectorResults) {
    const existing = combined.get(result.id);
    if (existing) {
      existing.vectorScore = Math.max(existing.vectorScore, result.score);
    } else {
      const { getNote } = await import('../vault/Vault.js');
      const vaultNote = await getNote(vault, result.id);
      if (vaultNote) {
        combined.set(result.id, {
          item: {
            id: vaultNote.frontmatter.id,
            title: vaultNote.frontmatter.title,
            summary: vaultNote.frontmatter.summary,
            type: vaultNote.frontmatter.type,
            agent: vaultNote.frontmatter.agent,
            tags: vaultNote.frontmatter.tags,
            createdAt: vaultNote.frontmatter.createdAt,
            score: 0,
          },
          ftsScore: 0,
          vectorScore: result.score,
        });
      }
    }
  }

  const results = Array.from(combined.values())
    .map(({ item, ftsScore, vectorScore }) => ({
      ...item,
      score: ftsWeight * ftsScore + vectorWeight * vectorScore,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

export async function getCollectionStats(index: VectorIndex): Promise<{
  count: number;
  dimension: number;
}> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }

  const count = await index.collection.count();
  return { count, dimension: EMBEDDING_DIMENSION };
}

export async function persistIndex(index: VectorIndex): Promise<void> {
  if (!index.initialized) {
    throw new VectorIndexError('Vector index not initialized', 'NOT_INITIALIZED');
  }
  // Chroma persists automatically when using a file path
}

export async function closeIndex(index: VectorIndex): Promise<void> {
  index.initialized = false;
  // Chroma client doesn't need explicit close
}
