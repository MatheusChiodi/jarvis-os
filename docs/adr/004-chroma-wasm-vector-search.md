# ADR-004: Chroma WASM + @xenova/transformers for Vector Search

**Date:** 2026-10-31
**Status:** Accepted
**Author:** Matheus Chiodi

## Context

Memory layer precisa de **busca semântica/vetorial** para progressive disclosure:
- `searchIndex()` → retorna IDs + títulos + summaries (compact)
- `getObservations(ids[])` → retorna detalhes completos
- Embeddings locais (sem servidor, offline)
- Modelo leve (< 50MB), rápido (< 100ms inference)
- Index HNSW para busca aproximada k-NN

## Decision

Usar **Chroma compilado para WASM** + **@xenova/transformers** (ONNX Runtime Web) para embeddings locais.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Chroma WASM + Xenova** | **Totalmente local, offline, ~22MB modelo, HNSW, API familiar** | **WASM overhead, cold start ~500ms** |
| **Chroma Server (Docker/localhost)** | Performance nativo, escala | Precisa processo separado, Docker, port binding |
| **LanceDB WASM** | Columnar, fast, Rust/WASM | Menos maduro, API diferente |
| **Faiss WASM** | Facebook, muito rápido | Low-level, sem metadata/store, complexo |
| **HNSWLib WASM** | Puro HNSW, rápido | Sem persistência, sem metadata, manual |
| **Transformers.js + custom HNSW** | Controle total | Reinventar roda, manutenção |
| **OpenAI/Embeddings API** | Sem custo local | **Viola NFR-01 (local-first), latência, custo, privacidade** |

## Consequences

### Positive
- **100% Local**: Zero dados saem da máquina
- **Offline-capable**: Funciona sem internet
- **Modelo padrão**: `Xenova/all-MiniLM-L6-v2` (384 dim, 22MB, multilíngue)
- **Chroma API**: Familiar (`add`, `query`, `get`, `delete`, `update`)
- **HNSW Index**: Busca aproximada O(log n) com recall configurável
- **Metadata filtering**: Chroma suporta `where` clauses (project_id, type, tags)
- **Persistência**: Chroma WASM salva no IndexedDB / OPFS

### Negative
- **Cold start**: ~500ms para carregar modelo ONNX + inicializar Chroma
- **Memória**: ~100MB (modelo + index + WASM heap)
- **Bundle size**: ~5MB JS + 22MB modelo (lazy loaded)
- **Single-threaded**: ONNX Web roda na main thread (pode travar UI)
- **WebGPU não universal**: Fallback para WASM no Firefox/Safari

## Implementation

```typescript
// packages/memory/src/search/VectorIndex.ts
import { ChromaClient } from 'chromadb/wasm';
import { pipeline, env } from '@xenova/transformers';

// Configure transformers
env.allowLocalModels = true;
env.useBrowserCache = true;

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const COLLECTION_NAME = 'jarvis_memory';

let embedder: Promise<any>;
let chroma: ChromaClient;

export async function initVectorIndex(persistPath?: string): Promise<void> {
  // Initialize embedder (lazy, cached)
  embedder = pipeline('feature-extraction', EMBEDDING_MODEL, {
    quantized: true, // INT8 quantization for speed
  });

  // Initialize Chroma WASM
  chroma = new ChromaClient({
    // WASM mode - uses IndexedDB/OPFS for persistence
    path: persistPath || 'indexeddb://jarvis-chroma',
  });

  // Ensure collection exists
  await chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { 'hnsw:space': 'cosine' },
  });
}

export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await embedder;
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data);
}

export async function addNoteEmbedding(
  noteId: string,
  text: string,
  metadata: NoteMetadata
): Promise<void> {
  const embedding = await embedText(text);
  await chroma.getCollection(COLLECTION_NAME).add({
    ids: [noteId],
    embeddings: [Array.from(embedding)],
    metadatas: [metadata],
    documents: [text], // Store for debugging
  });
}

export async function searchSimilar(
  query: string,
  limit = 20,
  filter?: Record<string, any>
): Promise<VectorSearchResult[]> {
  const queryEmbedding = await embedText(query);
  const collection = chroma.getCollection(COLLECTION_NAME);
  
  const results = await collection.query({
    queryEmbeddings: [Array.from(queryEmbedding)],
    nResults: limit,
    where: filter,
    include: ['metadatas', 'documents', 'distances'],
  });

  return results.ids[0].map((id, i) => ({
    id,
    score: 1 - results.distances[0][i], // cosine similarity
    metadata: results.metadatas[0][i],
    document: results.documents[0][i],
  }));
}

export async function deleteNoteEmbedding(noteId: string): Promise<void> {
  await chroma.getCollection(COLLECTION_NAME).delete({ ids: [noteId] });
}

export async function updateNoteEmbedding(
  noteId: string,
  text: string,
  metadata: NoteMetadata
): Promise<void> {
  await deleteNoteEmbedding(noteId);
  await addNoteEmbedding(noteId, text, metadata);
}

// Progressive disclosure: search index (lightweight)
export interface SearchIndexItem {
  id: string;
  title: string;
  summary: string;
  type: NoteType;
  agent: string;
  tags: string[];
  createdAt: string;
  score: number;
}

export async function searchIndex(
  query: string,
  limit = 50,
  projectId: string
): Promise<SearchIndexItem[]> {
  const results = await searchSimilar(query, limit, { project_id: projectId });
  return results.map(r => ({
    id: r.id,
    title: r.metadata.title,
    summary: r.metadata.summary,
    type: r.metadata.type,
    agent: r.metadata.agent,
    tags: r.metadata.tags.split(',').filter(Boolean),
    createdAt: r.metadata.created_at,
    score: r.score,
  }));
}
```

```typescript
// packages/memory/search/ProgressiveDisclosure.ts
import { searchIndex, searchSimilar } from './VectorIndex';
import { getNotesByIds, getTimeline } from '../vault/NoteRepository';

// Layer 1: Compact index (search)
export async function search(
  projectId: string,
  query: string,
  limit = 20
): Promise<SearchIndexItem[]> {
  return searchIndex(query, limit, projectId);
}

// Layer 2: Timeline context (getTimeline)
export async function getTimelineContext(
  projectId: string,
  aroundDate: string,
  windowDays = 7
): Promise<TimelineEvent[]> {
  return getTimeline(projectId, aroundDate, windowDays);
}

// Layer 3: Full observations (getObservations)
export async function getObservations(
  projectId: string,
  ids: string[]
): Promise<ObservationDetail[]> {
  const notes = await getNotesByIds(projectId, ids);
  
  // Enrich with related notes (wikilinks + tag siblings)
  for (const note of notes) {
    note.relatedNotes = await findRelatedNotes(projectId, note);
  }
  
  return notes;
}
```

## Model Options

| Model | Dims | Size | Speed | Quality | Languages |
|-------|------|------|-------|---------|-----------|
| **all-MiniLM-L6-v2** | 384 | 22MB | **Fast** | Good | 50+ |
| all-MiniLM-L12-v2 | 384 | 45MB | Medium | Better | 50+ |
| paraphrase-multilingual-MiniLM-L12-v2 | 384 | 45MB | Medium | Best multilingual | 50+ |
| bge-small-en-v1.5 | 384 | 22MB | Fast | Best English | English |
| e5-small-v2 | 384 | 22MB | Fast | Good | 100+ |

**Default**: `Xenova/all-MiniLM-L6-v2` (balance speed/quality/size)

## Optimization Strategies

1. **Lazy loading**: Carregar embedder/Chroma só na primeira busca
2. **Quantization**: `quantized: true` → INT8 (4x menor, 2x mais rápido, ~2% quality loss)
3. **Batch embeddings**: `pipe([text1, text2, ...])` para múltiplas notas
4. **Caching**: Cache embeddings de queries recentes (LRU, 100 entries)
5. **Web Worker**: Mover embedder para Web Worker (futuro)
6. **WebGPU**: `device: 'webgpu'` no Chrome/Edge para 10x speedup

## References

- [Chroma WASM](https://docs.trychroma.com/getting-started/installation#wasmmemory)
- [Xenova/Transformers.js](https://huggingface.co/docs/transformers.js/index)
- [all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/api/js/api.html)