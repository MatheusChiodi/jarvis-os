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
];

export function getCurrentSchemaVersion(): number {
  return MIGRATIONS.length;
}