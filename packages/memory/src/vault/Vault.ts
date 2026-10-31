import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlJsWasm from 'sql.js/dist/sql-wasm.wasm?url';
import { MIGRATIONS } from './Schema';
import type { Note, NoteFrontmatter, NoteType, NoteFilters, SearchResult, Vault as VaultType } from '@jarvis-os/core';
import { generateId, nowISO, validateNoteFrontmatter } from '@jarvis-os/core';

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
  private path: string;
  private dirty = false;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  static async open(projectId: string, path?: string): Promise<Vault> {
    const SQL = await initSql();
    let db: Database;

    if (path) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.arrayBuffer();
          db = new SQL.Database(new Uint8Array(data));
        } else {
          throw new Error('File not found');
        }
      } catch {
        db = new SQL.Database();
        db.exec(MIGRATIONS.join(';'));
      }
    } else {
      db = new SQL.Database();
      db.exec(MIGRATIONS.join(';'));
    }

    // Ensure project exists
    const projectStmt = db.prepare('SELECT id FROM projects WHERE id = ?');
    const projectExists = projectStmt.getAsObject([projectId])?.id;
    projectStmt.free();

    if (!projectExists) {
      const insertProject = db.prepare(`
        INSERT INTO projects (id, name, path, created_at, updated_at, schema_version)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertProject.run([projectId, projectId, path || '', nowISO(), nowISO(), MIGRATIONS.length]);
      insertProject.free();
    }

    const vault = new Vault(db, projectId, path || '');
    vault.startAutoSave();
    return vault;
  }

  private constructor(db: Database, projectId: string, path: string) {
    this.db = db;
    this.projectId = projectId;
    this.path = path;
  }

  private startAutoSave(): void {
    this.saveInterval = setInterval(() => {
      if (this.dirty && this.path) {
        this.saveToPath(this.path);
      }
    }, 5000);
  }

  saveToPath(path: string): void {
    try {
      const data = this.db.export();
      // In Tauri, we'd use the fs plugin to write the file
      // For now, we'll emit an event for the frontend to handle
      this.dirty = false;
    } catch (error) {
      console.error('Failed to save vault:', error);
    }
  }

  // ============================================================================
  // Notes CRUD
  // ============================================================================

  saveNote(note: Omit<Note, 'path'>): Note {
    const frontmatter = validateNoteFrontmatter(note.frontmatter);
    const now = nowISO();

    const isNew = !this.noteExists(frontmatter.id);

    if (isNew) {
      const stmt = this.db.prepare(`
        INSERT INTO notes (id, project_id, type, title, summary, content, frontmatter_json, tags, agent, task_id, wikilinks, pinned, archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        frontmatter.id,
        this.projectId,
        frontmatter.type,
        frontmatter.title,
        frontmatter.summary,
        note.content,
        JSON.stringify(frontmatter),
        frontmatter.tags.join(','),
        frontmatter.agent,
        frontmatter.taskId || '',
        frontmatter.wikilinks.join(','),
        frontmatter.pinned ? 1 : 0,
        frontmatter.archived ? 1 : 0,
        frontmatter.createdAt,
        now,
      ]);
      stmt.free();

      // Insert into FTS5
      const ftsStmt = this.db.prepare(`
        INSERT INTO notes_fts (id, project_id, type, title, summary, content, tags, agent, task_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      ftsStmt.run([
        frontmatter.id,
        this.projectId,
        frontmatter.type,
        frontmatter.title,
        frontmatter.summary,
        note.content,
        frontmatter.tags.join(','),
        frontmatter.agent,
        frontmatter.taskId || '',
        frontmatter.createdAt,
        now,
      ]);
      ftsStmt.free();
    } else {
      const stmt = this.db.prepare(`
        UPDATE notes SET
          type = ?, title = ?, summary = ?, content = ?, frontmatter_json = ?,
          tags = ?, agent = ?, task_id = ?, wikilinks = ?, pinned = ?, archived = ?, updated_at = ?
        WHERE id = ? AND project_id = ?
      `);
      stmt.run([
        frontmatter.type,
        frontmatter.title,
        frontmatter.summary,
        note.content,
        JSON.stringify(frontmatter),
        frontmatter.tags.join(','),
        frontmatter.agent,
        frontmatter.taskId || '',
        frontmatter.wikilinks.join(','),
        frontmatter.pinned ? 1 : 0,
        frontmatter.archived ? 1 : 0,
        now,
        frontmatter.id,
        this.projectId,
      ]);
      stmt.free();

      // Update FTS5
      const ftsStmt = this.db.prepare(`
        UPDATE notes_fts SET
          type = ?, title = ?, summary = ?, content = ?, tags = ?, agent = ?, task_id = ?, updated_at = ?
        WHERE id = ? AND project_id = ?
      `);
      ftsStmt.run([
        frontmatter.type,
        frontmatter.title,
        frontmatter.summary,
        note.content,
        frontmatter.tags.join(','),
        frontmatter.agent,
        frontmatter.taskId || '',
        now,
        frontmatter.id,
        this.projectId,
      ]);
      ftsStmt.free();
    }

    this.dirty = true;
    return { ...note, frontmatter: { ...frontmatter, updatedAt: now } };
  }

  getNote(ref: string): Note | null {
    // Try exact ID match first
    let stmt = this.db.prepare('SELECT * FROM notes WHERE id = ? AND project_id = ?');
    let row = stmt.getAsObject([ref, this.projectId]);
    stmt.free();

    if (!row || !row.id) {
      // Try slug match
      stmt = this.db.prepare('SELECT * FROM notes WHERE id LIKE ? AND project_id = ?');
      row = stmt.getAsObject([`%${ref}%`, this.projectId]);
      stmt.free();
    }

    if (!row || !row.id) {
      // Try title/summary match
      stmt = this.db.prepare('SELECT * FROM notes WHERE (title LIKE ? OR summary LIKE ?) AND project_id = ? LIMIT 1');
      row = stmt.getAsObject([`%${ref}%`, `%${ref}%`, this.projectId]);
      stmt.free();
    }

    if (!row || !row.id) return null;

    return this.rowToNote(row);
  }

  listNotes(filters: NoteFilters = {}): Note[] {
    let query = 'SELECT * FROM notes WHERE project_id = ?';
    const params: any[] = [this.projectId];

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
      params.push(`%${filters.tag}%`);
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

    const stmt = this.db.prepare(query);
    const notes: Note[] = [];

    for (const row of stmt.iterate(params)) {
      notes.push(this.rowToNote(row));
    }
    stmt.free();

    return notes;
  }

  archiveNote(ref: string): boolean {
    const note = this.getNote(ref);
    if (!note) return false;

    const stmt = this.db.prepare('UPDATE notes SET archived = 1, updated_at = ? WHERE id = ? AND project_id = ?');
    stmt.run([nowISO(), note.frontmatter.id, this.projectId]);
    stmt.free();

    this.dirty = true;
    return true;
  }

  deleteNote(ref: string): boolean {
    const note = this.getNote(ref);
    if (!note) return false;

    const stmt = this.db.prepare('DELETE FROM notes WHERE id = ? AND project_id = ?');
    stmt.run([note.frontmatter.id, this.projectId]);
    stmt.free();

    const ftsStmt = this.db.prepare('DELETE FROM notes_fts WHERE id = ? AND project_id = ?');
    ftsStmt.run([note.frontmatter.id, this.projectId]);
    ftsStmt.free();

    this.dirty = true;
    return true;
  }

  // ============================================================================
  // Search
  // ============================================================================

  searchNotes(query: string, limit = 50): SearchResult[] {
    const stmt = this.db.prepare(`
      SELECT n.*, 
             snippet(notes_fts, -1, '', '', '...', 10) as snippet,
             rank as score
      FROM notes_fts
      JOIN notes n ON n.id = notes_fts.id
      WHERE notes_fts MATCH ?
        AND n.project_id = ?
        AND n.archived = 0
      ORDER BY rank
      LIMIT ?
    `);

    const results: SearchResult[] = [];
    for (const row of stmt.iterate([query, this.projectId, limit])) {
      const note = this.rowToNote(row);
      results.push({
        note,
        score: (row as any).score || 0,
        matches: [{ field: 'content', snippet: (row as any).snippet || '' }],
      });
    }
    stmt.free();
    return results;
  }

  // ============================================================================
  // Wikilinks & Graph
  // ============================================================================

  getBacklinks(ref: string): Note[] {
    const note = this.getNote(ref);
    if (!note) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM notes 
      WHERE wikilinks LIKE ? AND project_id = ? AND archived = 0
    `);
    const backlinks: Note[] = [];
    for (const row of stmt.iterate([`%${note.frontmatter.title}%`, this.projectId])) {
      backlinks.push(this.rowToNote(row));
    }
    stmt.free();
    return backlinks;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private noteExists(id: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM notes WHERE id = ? AND project_id = ?');
    const result = stmt.getAsObject([id, this.projectId]);
    stmt.free();
    return !!result?.id;
  }

  private rowToNote(row: any): Note {
    const frontmatter = JSON.parse(row.frontmatter_json);
    return {
      frontmatter: {
        ...frontmatter,
        tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
        wikilinks: row.wikilinks ? row.wikilinks.split(',').filter(Boolean) : [],
        pinned: !!row.pinned,
        archived: !!row.archived,
      },
      content: row.content,
      path: `${this.projectId}/memory/${row.id}.md`,
    };
  }

  close(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    if (this.dirty && this.path) {
      this.saveToPath(this.path);
    }
    this.db.close();
  }
}

export function createVault(projectId: string, path?: string): Promise<Vault> {
  return Vault.open(projectId, path);
}