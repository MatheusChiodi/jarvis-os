import type { NoteType } from '@jarvis-os/core';

export const SCHEMA_VERSION = 1;

export const MIGRATIONS: readonly string[] = [
  `-- Migration 1: Initial schema
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('memory', 'decision', 'learning', 'communication', 'state')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  agent TEXT NOT NULL,
  task_id TEXT,
  wikilinks TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  path TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(type);
CREATE INDEX IF NOT EXISTS idx_notes_agent ON notes(agent);
CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(archived);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  project_id UNINDEXED,
  type UNINDEXED,
  title,
  summary,
  content,
  tags,
  agent,
  task_id,
  wikilinks,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts (id, project_id, type, title, summary, content, tags, agent, task_id, wikilinks)
  VALUES (new.id, new.project_id, new.type, new.title, new.summary, new.content, new.tags, new.agent, new.task_id, new.wikilinks);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
  UPDATE notes_fts SET
    project_id = new.project_id,
    type = new.type,
    title = new.title,
    summary = new.summary,
    content = new.content,
    tags = new.tags,
    agent = new.agent,
    task_id = new.task_id,
    wikilinks = new.wikilinks
  WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
  DELETE FROM notes_fts WHERE id = old.id;
END;

CREATE TABLE IF NOT EXISTS note_embeddings (
  note_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_embeddings_project_id ON note_embeddings(project_id);

CREATE TABLE IF NOT EXISTS hook_state (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  hook_type TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  state TEXT NOT NULL DEFAULT '{}',
  last_triggered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hook_state_project_agent ON hook_state(project_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_hook_state_type ON hook_state(hook_type);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (1, datetime('now'));`,
];

export const NOTE_TYPE_VALUES: readonly NoteType[] = [
  'memory',
  'decision',
  'learning',
  'communication',
  'state',
];

export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  project_id: string;
  type: NoteType;
  title: string;
  summary: string;
  content: string;
  tags: string;
  agent: string;
  task_id: string | null;
  wikilinks: string;
  pinned: number;
  archived: number;
  created_at: string;
  updated_at: string;
  path: string;
}

export interface NoteFtsRow {
  id: string;
  project_id: string;
  type: NoteType;
  title: string;
  summary: string;
  content: string;
  tags: string;
  agent: string;
  task_id: string | null;
  wikilinks: string;
  created_at: string;
}

export interface NoteEmbeddingRow {
  note_id: string;
  project_id: string;
  embedding: Uint8Array;
  model: string;
  dimension: number;
  created_at: string;
}

export interface HookStateRow {
  id: string;
  project_id: string;
  hook_type: string;
  agent_id: string;
  task_id: string | null;
  state: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}
