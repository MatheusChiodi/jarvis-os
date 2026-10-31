# ADR-003: SQLite WASM (sql.js) + FTS5 for Vault

**Date:** 2026-10-31
**Status:** Accepted
**Author:** Matheus Chiodi

## Context

Memory layer precisa:
- Rodar no **renderer process** (WebView) - sem IPC para queries
- **Zero native dependencies** - facilita distribuição cross-platform
- **Full-text search** performático para 10k+ notas
- **ACID transactions** para integridade de dados
- **Schema migrations** versionadas
- **Offline-first** - sem servidor separado

## Decision

Usar **sql.js** (SQLite compilado para WebAssembly) com extensão **FTS5** habilitada.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **sql.js + FTS5** | **WASM, zero native, FTS5 nativo, ACID, ~2MB** | **WASM overhead, ~10-20% slower que native** |
| **IndexedDB** | Native browser API, no WASM | No SQL, no FTS5, query API limitada, migrações complexas |
| **Dexie.js** | Wrapper amigável para IndexedDB | Mesmo problema do IndexedDB |
| **RxDB** | Reactive, sync, plugins | Heavy (~200KB), complex, overkill |
| **SQLite native (Node.js)** | Performance nativo | Precisa IPC main↔renderer, native deps |
| **PostgreSQL WASM (pglite)** | Full PostgreSQL | ~10MB WASM, overkill para embedded |
| **DuckDB WASM** | Analytics-focused | ~20MB, não otimizado para OLTP |

## Consequences

### Positive
- **Zero native deps**: Funciona out-of-the-box no Tauri WebView
- **FTS5 nativo**: Full-text search com ranking BM25, tokenização Unicode, prefix search
- **SQL familiar**: Mesma sintaxe SQLite, migrações padrão
- **ACID**: Transações, WAL mode, checkpoints
- **Portável**: Arquivo `.sqlite` copiável entre máquinas
- **Backup simples**: `VACUUM INTO 'backup.sqlite'`

### Negative
- **WASM bundle**: ~2MB (sql.js + FTS5) - carrega assincronamente
- **Cold start**: ~50-100ms para instanciar WASM heap
- **Memory**: Heap WASM limitado (~100MB default, configurável)
- **Threading**: Single-threaded (no Web Workers para SQLite)
- **Persistence**: Precisa serializar para `localStorage` / `IndexedDB` / File System Access API

## Implementation

```typescript
// packages/memory/src/vault/Vault.ts
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlJsWasm from 'sql.js/dist/sql-wasm.wasm?url';

let SQL: SqlJsStatic;

export async function initSql(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  SQL = await initSqlJs({
    locateFile: () => sqlJsWasm,
  });
  return SQL;
}

export class Vault {
  private db: Database;
  private projectId: string;
  private dirty = false;
  private saveInterval: NodeJS.Timeout;

  static async open(projectId: string, path?: string): Promise<Vault> {
    const SQL = await initSql();
    let db: Database;
    
    if (path && await fileExists(path)) {
      const data = await readFile(path);
      db = new SQL.Database(new Uint8Array(data));
    } else {
      db = new SQL.Database();
      db.exec(Schema.MIGRATIONS.join(';'));
    }
    
    const vault = new Vault(db, projectId);
    vault.startAutoSave(path);
    return vault;
  }

  private constructor(db: Database, projectId: string) {
    this.db = db;
    this.projectId = projectId;
  }

  // FTS5 search
  searchNotes(query: string, limit = 50): SearchResult[] {
    const stmt = this.db.prepare(`
      SELECT n.*, 
             snippet(notes_fts, -1, '', '', '...', 10) as snippet,
             rank as score
      FROM notes_fts
      JOIN notes n ON n.id = notes_fts.id
      WHERE notes_fts MATCH :query
        AND n.project_id = :projectId
        AND n.archived = 0
      ORDER BY rank
      LIMIT :limit
    `);
    
    const results = [];
    for (const row of stmt.iterate({ query, projectId: this.projectId, limit })) {
      results.push(this.rowToNote(row));
    }
    stmt.free();
    return results;
  }

  // Vector search integration (Chroma WASM)
  async searchVector(embedding: Float32Array, limit = 20): Promise<VectorResult[]> {
    // Delegado para Chroma WASM index
    return this.chromaIndex.query(embedding, limit);
  }
}
```

```sql
-- packages/memory/src/vault/Schema.ts
export const MIGRATIONS = [
  `-- 001_initial_schema
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    schema_version INTEGER DEFAULT 1
  );

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL CHECK (type IN ('memory','decision','learning','communication','state')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT NOT NULL,
    frontmatter_json TEXT NOT NULL,
    tags TEXT NOT NULL,
    agent TEXT NOT NULL,
    task_id TEXT,
    wikilinks TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE VIRTUAL TABLE notes_fts USING fts5(
    id UNINDEXED,
    project_id UNINDEXED,
    type UNINDEXED,
    title,
    summary,
    content,
    tags,
    agent UNINDEXED,
    task_id UNINDEXED,
    created_at UNINDEXED,
    updated_at UNINDEXED,
    tokenize = 'porter unicode61'
  );

  CREATE TABLE note_embeddings (
    note_id TEXT PRIMARY KEY REFERENCES notes(id),
    chroma_id TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE hook_state (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('task_completed','teammate_idle')),
    project_id TEXT NOT NULL,
    last_note_id TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX idx_notes_project_type ON notes(project_id, type);
  CREATE INDEX idx_notes_agent ON notes(agent);
  CREATE INDEX idx_notes_task ON notes(task_id);
  CREATE INDEX idx_notes_created ON notes(created_at);
  CREATE INDEX idx_notes_pinned ON notes(pinned) WHERE pinned = 1;
  `,
  
  `-- 002_add_schema_version_to_projects
  ALTER TABLE projects ADD COLUMN schema_version INTEGER DEFAULT 2;
  UPDATE projects SET schema_version = 2 WHERE schema_version IS NULL;
  `,
];

export function getCurrentSchemaVersion(): number {
  return MIGRATIONS.length;
}
```

## Performance Benchmarks (Target)

| Operation | Target (10k notes) |
|-----------|-------------------|
| Cold start (WASM init) | < 100ms |
| FTS5 search (keyword) | < 50ms p95 |
| Note insert | < 10ms |
| Note update | < 10ms |
| Vector search (Chroma) | < 100ms |
| Auto-save (debounced) | < 5ms |

## References

- [sql.js](https://github.com/sql-js/sql.js)
- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [sql.js FTS5 build](https://github.com/sql-js/sql.js/blob/master/README.md#building-with-fts5-support)