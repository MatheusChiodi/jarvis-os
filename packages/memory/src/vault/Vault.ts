import type {
  GraphEdge,
  GraphNode,
  MermaidGraph,
  Note,
  NoteFilters,
  NoteType,
  ObservationDetail,
  SearchIndexItem,
  TimelineEvent,
} from '@jarvis-os/core';
import { generateId, nowISO } from '@jarvis-os/core';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import {
  type HookStateRow,
  MIGRATIONS,
  type NoteFtsRow,
  type NoteRow,
  SCHEMA_VERSION,
} from './Schema.js';

export interface VaultConfig {
  projectId: string;
  projectName: string;
  projectPath: string;
  persistPath?: string;
}

export interface Vault {
  projectId: string;
  path: string;
  db: Database;
  sqlJs: SqlJsStatic;
  initialized: boolean;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  type?: NoteType;
  agent?: string;
  tags?: string[];
  since?: string;
  until?: string;
}

export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/${file}`,
    });
  }
  return sqlJsPromise;
}

export async function createVault(config: VaultConfig): Promise<Vault> {
  const sqlJs = await getSqlJs();
  const db = new sqlJs.Database();
  const vault: Vault = {
    projectId: config.projectId,
    path: config.projectPath,
    db,
    sqlJs,
    initialized: false,
  };

  await initializeDatabase(vault);
  await ensureProjectExists(vault, config);
  vault.initialized = true;
  return vault;
}

export async function openVault(projectId: string, projectPath: string): Promise<Vault> {
  const sqlJs = await getSqlJs();
  const db = new sqlJs.Database();
  const vault: Vault = {
    projectId,
    path: projectPath,
    db,
    sqlJs,
    initialized: false,
  };

  await initializeDatabase(vault);
  vault.initialized = true;
  return vault;
}

async function initializeDatabase(vault: Vault): Promise<void> {
  for (const migration of MIGRATIONS) {
    try {
      vault.db.exec(migration);
    } catch (error) {
      throw new VaultError(
        `Failed to apply migration: ${error instanceof Error ? error.message : String(error)}`,
        'MIGRATION_FAILED',
        error instanceof Error ? error : undefined
      );
    }
  }

  const versionResult = vault.db.exec(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  const firstRow = versionResult[0];
  const values = firstRow?.values;
  if (values && values.length > 0 && values[0] && values[0].length > 0) {
    const currentVersion = values[0][0] as number;
    if (currentVersion < SCHEMA_VERSION) {
      throw new VaultError(
        `Database schema version ${currentVersion} is older than expected ${SCHEMA_VERSION}`,
        'SCHEMA_VERSION_MISMATCH'
      );
    }
  }
}

async function ensureProjectExists(vault: Vault, config: VaultConfig): Promise<void> {
  const stmt = vault.db.prepare(`
    INSERT OR IGNORE INTO projects (id, name, path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run([config.projectId, config.projectName, config.projectPath, nowISO(), nowISO()]);
  stmt.free();
}

function rowToNote(row: NoteRow): Note {
  return {
    frontmatter: {
      id: row.id,
      type: row.type,
      title: row.title,
      summary: row.summary,
      tags: JSON.parse(row.tags),
      agent: row.agent,
      taskId: row.task_id || undefined,
      project: row.project_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      wikilinks: JSON.parse(row.wikilinks),
      pinned: Boolean(row.pinned),
      archived: Boolean(row.archived),
    },
    content: row.content,
    path: row.path,
  };
}

function rowToSearchIndexItem(row: NoteFtsRow, score: number): SearchIndexItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    type: row.type,
    agent: row.agent,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at as string,
    score,
  };
}

function rowToTimelineEvent(row: NoteFtsRow): SearchIndexItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    type: row.type,
    agent: row.agent,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at as string,
    score: 0,
  };
}

export async function saveNote(vault: Vault, note: Omit<Note, 'path'>): Promise<Note> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const path = `${note.frontmatter.id}.md`;
  const updatedNote: Note = { ...note, path };

  const stmt = vault.db.prepare(`
    INSERT OR REPLACE INTO notes (
      id, project_id, type, title, summary, content, tags, agent, task_id,
      wikilinks, pinned, archived, created_at, updated_at, path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run([
    updatedNote.frontmatter.id,
    updatedNote.frontmatter.project,
    updatedNote.frontmatter.type,
    updatedNote.frontmatter.title,
    updatedNote.frontmatter.summary,
    updatedNote.content,
    JSON.stringify(updatedNote.frontmatter.tags),
    updatedNote.frontmatter.agent,
    updatedNote.frontmatter.taskId || null,
    JSON.stringify(updatedNote.frontmatter.wikilinks),
    updatedNote.frontmatter.pinned ? 1 : 0,
    updatedNote.frontmatter.archived ? 1 : 0,
    updatedNote.frontmatter.createdAt,
    nowISO(),
    path,
  ]);
  stmt.free();

  return updatedNote;
}

export async function getNote(vault: Vault, ref: string): Promise<Note | null> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    SELECT * FROM notes WHERE id = ? OR path = ? OR title = ?
    LIMIT 1
  `);
  stmt.bind([ref, ref, ref]);

  const result: Note | null = stmt.step()
    ? rowToNote(stmt.getAsObject() as unknown as NoteRow)
    : null;
  stmt.free();
  return result;
}

export async function listNotes(vault: Vault, filters: NoteFilters = {}): Promise<Note[]> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  let query = 'SELECT * FROM notes WHERE project_id = ?';
  const params: (string | number | null)[] = [vault.projectId];

  if (filters.type) {
    query += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.agent) {
    query += ' AND agent = ?';
    params.push(filters.agent);
  }
  if (filters.tag) {
    query += ' AND tags LIKE ?';
    params.push(`%"${filters.tag}"%`);
  }
  if (filters.taskId) {
    query += ' AND task_id = ?';
    params.push(filters.taskId);
  }
  if (filters.since) {
    query += ' AND created_at >= ?';
    params.push(filters.since);
  }
  if (filters.archived !== undefined) {
    query += ' AND archived = ?';
    params.push(filters.archived ? 1 : 0);
  } else {
    query += ' AND archived = 0';
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = vault.db.prepare(query);
  stmt.bind(params);

  const notes: Note[] = [];
  while (stmt.step()) {
    notes.push(rowToNote(stmt.getAsObject() as unknown as NoteRow));
  }
  stmt.free();

  return notes;
}

export async function archiveNote(vault: Vault, ref: string): Promise<void> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    UPDATE notes SET archived = 1, updated_at = ? WHERE id = ? OR path = ? OR title = ?
  `);
  stmt.run([nowISO(), ref, ref, ref]);
  stmt.free();
}

export async function deleteNote(vault: Vault, ref: string): Promise<void> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    DELETE FROM notes WHERE id = ? OR path = ? OR title = ?
  `);
  stmt.run([ref, ref, ref]);
  stmt.free();
}

export async function searchIndex(
  vault: Vault,
  options: SearchOptions
): Promise<SearchIndexItem[]> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const { query, limit = 20, type, agent, tags, since, until } = options;

  let ftsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(' ');

  if (!ftsQuery.trim()) {
    ftsQuery = '*';
  }

  let sql = `
    SELECT n.*, bm25(notes_fts) as score
    FROM notes_fts
    JOIN notes n ON notes_fts.id = n.id
    WHERE notes_fts MATCH ?
    AND n.project_id = ?
    AND n.archived = 0
  `;
  const params: (string | number)[] = [ftsQuery, vault.projectId];

  if (type) {
    sql += ' AND n.type = ?';
    params.push(type);
  }
  if (agent) {
    sql += ' AND n.agent = ?';
    params.push(agent);
  }
  if (tags && tags.length > 0) {
    const tagConditions = tags.map(() => 'n.tags LIKE ?').join(' AND ');
    sql += ` AND (${tagConditions})`;
    for (const tag of tags) {
      params.push(`%"${tag}"%`);
    }
  }
  if (since) {
    sql += ' AND n.created_at >= ?';
    params.push(since);
  }
  if (until) {
    sql += ' AND n.created_at <= ?';
    params.push(until);
  }

  sql += ' ORDER BY score ASC LIMIT ?';
  params.push(limit);

  const stmt = vault.db.prepare(sql);
  stmt.bind(params);

  const results: SearchIndexItem[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as NoteFtsRow & { score: number };
    results.push(rowToSearchIndexItem(row, row.score));
  }
  stmt.free();

  return results;
}

export async function getTimeline(
  vault: Vault,
  around?: string,
  windowDays = 7
): Promise<TimelineEvent[]> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const centerDate = around ? new Date(around) : new Date();
  const startDate = new Date(centerDate);
  startDate.setDate(startDate.getDate() - windowDays);
  const endDate = new Date(centerDate);
  endDate.setDate(endDate.getDate() + windowDays);

  const stmt = vault.db.prepare(`
    SELECT * FROM notes
    WHERE project_id = ?
    AND archived = 0
    AND created_at >= ?
    AND created_at <= ?
    ORDER BY created_at ASC
  `);
  stmt.bind([vault.projectId, startDate.toISOString(), endDate.toISOString()]);

  const notesByDate = new Map<string, SearchIndexItem[]>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as NoteFtsRow;
    const createdAt: string = (row.created_at as string) || '';
    const dateKey: string = createdAt.split('T')[0] || '';
    const item = rowToTimelineEvent(row);
    const existing = notesByDate.get(dateKey);
    if (existing) {
      existing.push(item);
    } else {
      notesByDate.set(dateKey, [item]);
    }
  }
  stmt.free();

  const events: TimelineEvent[] = [];
  for (const [timestamp, notes] of notesByDate.entries()) {
    events.push({ timestamp, notes });
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getObservations(vault: Vault, ids: string[]): Promise<ObservationDetail[]> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');
  const stmt = vault.db.prepare(`
    SELECT * FROM notes WHERE project_id = ? AND id IN (${placeholders})
  `);
  stmt.bind([vault.projectId, ...ids]);

  const notes: Note[] = [];
  while (stmt.step()) {
    notes.push(rowToNote(stmt.getAsObject() as unknown as NoteRow));
  }
  stmt.free();

  const observations: ObservationDetail[] = [];
  for (const note of notes) {
    const related = await getRelatedNotes(vault, note);
    observations.push({ ...note, relatedNotes: related });
  }

  return observations;
}

async function getRelatedNotes(vault: Vault, note: Note): Promise<SearchIndexItem[]> {
  const wikilinks = note.frontmatter.wikilinks;
  if (wikilinks.length === 0) return [];

  const placeholders = wikilinks.map(() => '?').join(',');
  const stmt = vault.db.prepare(`
    SELECT * FROM notes WHERE project_id = ? AND title IN (${placeholders}) AND archived = 0
  `);
  stmt.bind([vault.projectId, ...wikilinks]);

  const related: SearchIndexItem[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as NoteFtsRow;
    related.push(rowToTimelineEvent(row));
  }
  stmt.free();

  return related;
}

export async function getBacklinks(vault: Vault, ref: string): Promise<Note[]> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const targetNote = await getNote(vault, ref);
  if (!targetNote) return [];

  const stmt = vault.db.prepare(`
    SELECT * FROM notes
    WHERE project_id = ?
    AND archived = 0
    AND wikilinks LIKE ?
  `);
  stmt.bind([vault.projectId, `%"${targetNote.frontmatter.title}"%`]);

  const backlinks: Note[] = [];
  while (stmt.step()) {
    backlinks.push(rowToNote(stmt.getAsObject() as unknown as NoteRow));
  }
  stmt.free();

  return backlinks;
}

export async function getGraph(vault: Vault): Promise<MermaidGraph> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    SELECT id, title, type, wikilinks FROM notes
    WHERE project_id = ? AND archived = 0
  `);
  stmt.bind([vault.projectId]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();

  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as {
      id: string;
      title: string;
      type: NoteType;
      wikilinks: string;
    };
    const node: GraphNode = { id: row.id, label: row.title, type: row.type };
    nodes.push(node);
    nodeMap.set(row.id, node);

    const wikilinks = JSON.parse(row.wikilinks) as string[];
    for (const link of wikilinks) {
      edges.push({ from: row.id, to: link, label: 'references' });
    }
  }
  stmt.free();

  return { nodes, edges };
}

export async function saveEmbedding(
  vault: Vault,
  noteId: string,
  embedding: Float32Array,
  model: string
): Promise<void> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const buffer = Buffer.from(embedding.buffer);
  const stmt = vault.db.prepare(`
    INSERT OR REPLACE INTO note_embeddings (note_id, project_id, embedding, model, dimension, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run([noteId, vault.projectId, buffer, model, embedding.length, nowISO()]);
  stmt.free();
}

export async function getEmbedding(vault: Vault, noteId: string): Promise<Float32Array | null> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    SELECT embedding, dimension FROM note_embeddings WHERE note_id = ?
  `);
  stmt.bind([noteId]);

  let result: Float32Array | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as unknown as { embedding: Uint8Array; dimension: number };
    result = new Float32Array(row.embedding.buffer, 0, row.dimension);
  }
  stmt.free();

  return result;
}

export async function getHookState(
  vault: Vault,
  hookType: string,
  agentId: string
): Promise<HookStateRow | null> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const stmt = vault.db.prepare(`
    SELECT * FROM hook_state WHERE project_id = ? AND hook_type = ? AND agent_id = ?
  `);
  stmt.bind([vault.projectId, hookType, agentId]);

  let result: HookStateRow | null = null;
  if (stmt.step()) {
    result = stmt.getAsObject() as unknown as HookStateRow;
  }
  stmt.free();

  return result;
}

export async function setHookState(
  vault: Vault,
  hookType: string,
  agentId: string,
  state: Record<string, unknown>,
  taskId?: string
): Promise<void> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const id = generateId();
  const existing = await getHookState(vault, hookType, agentId);

  if (existing) {
    const stmt = vault.db.prepare(`
      UPDATE hook_state SET state = ?, last_triggered_at = ?, updated_at = ?, task_id = ?
      WHERE id = ?
    `);
    stmt.run([JSON.stringify(state), nowISO(), nowISO(), taskId || null, existing.id]);
    stmt.free();
  } else {
    const stmt = vault.db.prepare(`
      INSERT INTO hook_state (id, project_id, hook_type, agent_id, task_id, state, last_triggered_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      id,
      vault.projectId,
      hookType,
      agentId,
      taskId || null,
      JSON.stringify(state),
      nowISO(),
      nowISO(),
      nowISO(),
    ]);
    stmt.free();
  }
}

export async function exportToJson(vault: Vault): Promise<string> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  const notes = await listNotes(vault, { archived: true, limit: 10000 });
  return JSON.stringify(notes, null, 2);
}

export async function exportToBinary(vault: Vault): Promise<Uint8Array> {
  if (!vault.initialized) {
    throw new VaultError('Vault not initialized', 'NOT_INITIALIZED');
  }

  return vault.db.export();
}

export function closeVault(vault: Vault): void {
  if (vault.db) {
    vault.db.close();
    vault.initialized = false;
  }
}
