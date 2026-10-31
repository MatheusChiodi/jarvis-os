import { pipeline, env } from '@xenova/transformers';
import type { SearchIndexItem, TimelineEvent, ObservationDetail, NoteType, Note } from '@jarvis-os/core';

// Configure transformers for local use
env.allowLocalModels = true;
env.useBrowserCache = true;

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const COLLECTION_NAME = 'jarvis_memory';

let embedderPromise: Promise<any> | null = null;
let chromaClient: any = null;

export async function initVectorIndex(persistPath?: string): Promise<void> {
  // Initialize embedder (lazy, cached)
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', EMBEDDING_MODEL, {
      quantized: true,
    });
  }

  // Initialize Chroma (in-memory for now, would use WASM in production)
  try {
    const { ChromaClient } = await import('chromadb');
    chromaClient = new ChromaClient({
      path: persistPath || 'memory://',
    });

    await chromaClient.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
    });
  } catch (error) {
    console.warn('ChromaDB not available, vector search disabled:', error);
  }
}

export async function embedText(text: string): Promise<Float32Array> {
  if (!embedderPromise) await initVectorIndex();
  const pipe = await embedderPromise!;
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data);
}

export async function addNoteEmbedding(
  noteId: string,
  text: string,
  metadata: Record<string, any>
): Promise<void> {
  if (!chromaClient) return;

  const embedding = await embedText(text);
  const collection = chromaClient.getCollection(COLLECTION_NAME);

  await collection.add({
    ids: [noteId],
    embeddings: [Array.from(embedding)],
    metadatas: [metadata],
    documents: [text],
  });
}

export async function searchSimilar(
  query: string,
  limit = 20,
  filter?: Record<string, any>
): Promise<Array<{ id: string; score: number; metadata: any; document: string }>> {
  if (!chromaClient) return [];

  const queryEmbedding = await embedText(query);
  const collection = chromaClient.getCollection(COLLECTION_NAME);

  const results = await collection.query({
    queryEmbeddings: [Array.from(queryEmbedding)],
    nResults: limit,
    where: filter,
    include: ['metadatas', 'documents', 'distances'],
  });

  return results.ids[0].map((id: string, i: number) => ({
    id,
    score: 1 - results.distances[0][i], // cosine similarity
    metadata: results.metadatas[0][i],
    document: results.documents[0][i],
  }));
}

export async function deleteNoteEmbedding(noteId: string): Promise<void> {
  if (!chromaClient) return;
  const collection = chromaClient.getCollection(COLLECTION_NAME);
  await collection.delete({ ids: [noteId] });
}

export async function updateNoteEmbedding(
  noteId: string,
  text: string,
  metadata: Record<string, any>
): Promise<void> {
  await deleteNoteEmbedding(noteId);
  await addNoteEmbedding(noteId, text, metadata);
}

// ============================================================================
// Progressive Disclosure Layers
// ============================================================================

export interface SearchIndexItem {
  id: string;
  title: string;
  summary: string;
  type: NoteType;
  agent: string;
  tags: string[];
  createdAt: string;
  score: number;
  pinned?: boolean;
}

export interface TimelineEvent {
  timestamp: string;
  notes: SearchIndexItem[];
}

export interface ObservationDetail extends Note {
  relatedNotes: SearchIndexItem[];
}

// Layer 1: Compact index (search)
export async function searchIndex(
  vault: any, // Vault instance
  query: string,
  limit = 50,
  projectId: string
): Promise<SearchIndexItem[]> {
  // FTS5 keyword search
  const ftsResults = vault.searchNotes(query, limit);

  // Vector search (if available)
  let vectorResults: any[] = [];
  try {
    vectorResults = await searchSimilar(query, limit, { project_id: projectId });
  } catch {
    // Vector search not available
  }

  // Merge and rank results
  const merged = new Map<string, SearchIndexItem>();

  for (const result of ftsResults) {
    merged.set(result.note.frontmatter.id, {
      id: result.note.frontmatter.id,
      title: result.note.frontmatter.title,
      summary: result.note.frontmatter.summary,
      type: result.note.frontmatter.type,
      agent: result.note.frontmatter.agent,
      tags: result.note.frontmatter.tags,
      createdAt: result.note.frontmatter.createdAt,
      score: result.score,
      pinned: result.note.frontmatter.pinned,
    });
  }

  for (const result of vectorResults) {
    const existing = merged.get(result.id);
    const vectorScore = result.score;
    if (existing) {
      // Combine scores (weighted average)
      existing.score = (existing.score * 0.6) + (vectorScore * 0.4);
    } else {
      merged.set(result.id, {
        id: result.id,
        title: result.metadata.title,
        summary: result.metadata.summary,
        type: result.metadata.type,
        agent: result.metadata.agent,
        tags: result.metadata.tags?.split(',').filter(Boolean) || [],
        createdAt: result.metadata.created_at,
        score: vectorScore,
      });
    }
  }

  // Sort by score descending, pinned first
  return Array.from(merged.values())
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.score - a.score;
    })
    .slice(0, limit);
}

// Layer 2: Timeline context
export async function getTimeline(
  vault: any,
  projectId: string,
  aroundDate?: string,
  windowDays = 7
): Promise<TimelineEvent[]> {
  const since = aroundDate
    ? new Date(new Date(aroundDate).getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const notes = vault.listNotes({ since, limit: 500 });

  // Group by date
  const byDate = new Map<string, SearchIndexItem[]>();

  for (const note of notes) {
    const date = note.frontmatter.createdAt.split('T')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      id: note.frontmatter.id,
      title: note.frontmatter.title,
      summary: note.frontmatter.summary,
      type: note.frontmatter.type,
      agent: note.frontmatter.agent,
      tags: note.frontmatter.tags,
      createdAt: note.frontmatter.createdAt,
      score: 1,
    });
  }

  return Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .map(([timestamp, notes]) => ({ timestamp, notes }));
}

// Layer 3: Full observations
export async function getObservations(
  vault: any,
  projectId: string,
  ids: string[]
): Promise<ObservationDetail[]> {
  const notes: ObservationDetail[] = [];

  for (const id of ids) {
    const note = vault.getNote(id);
    if (!note) continue;

    // Find related notes (wikilinks + tag siblings)
    const related = await findRelatedNotes(vault, projectId, note);

    notes.push({
      ...note,
      relatedNotes: related,
    });
  }

  return notes;
}

async function findRelatedNotes(vault: any, projectId: string, note: Note): Promise<SearchIndexItem[]> {
  const related = new Map<string, SearchIndexItem>();

  // Wikilinks
  for (const link of note.frontmatter.wikilinks) {
    const linkedNote = vault.getNote(link);
    if (linkedNote) {
      related.set(linkedNote.frontmatter.id, {
        id: linkedNote.frontmatter.id,
        title: linkedNote.frontmatter.title,
        summary: linkedNote.frontmatter.summary,
        type: linkedNote.frontmatter.type,
        agent: linkedNote.frontmatter.agent,
        tags: linkedNote.frontmatter.tags,
        createdAt: linkedNote.frontmatter.createdAt,
        score: 1,
      });
    }
  }

  // Tag siblings
  if (note.frontmatter.tags.length > 0) {
    const allNotes = vault.listNotes({ projectId, limit: 200 });
    for (const n of allNotes) {
      if (n.frontmatter.id === note.frontmatter.id) continue;
      const commonTags = n.frontmatter.tags.filter(t => note.frontmatter.tags.includes(t));
      if (commonTags.length > 0) {
        related.set(n.frontmatter.id, {
          id: n.frontmatter.id,
          title: n.frontmatter.title,
          summary: n.frontmatter.summary,
          type: n.frontmatter.type,
          agent: n.frontmatter.agent,
          tags: n.frontmatter.tags,
          createdAt: n.frontmatter.createdAt,
          score: commonTags.length / note.frontmatter.tags.length,
        });
      }
    }
  }

  return Array.from(related.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export type NoteType = 'memory' | 'decision' | 'learning' | 'communication' | 'state';

export interface Note {
  frontmatter: {
    id: string;
    type: NoteType;
    title: string;
    summary: string;
    tags: string[];
    agent: string;
    taskId?: string;
    project: string;
    createdAt: string;
    updatedAt: string;
    wikilinks: string[];
    pinned: boolean;
    archived: boolean;
  };
  content: string;
  path: string;
}