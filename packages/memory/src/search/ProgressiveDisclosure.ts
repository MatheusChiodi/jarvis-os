import type {
  Note,
  NoteFilters,
  ObservationDetail,
  SearchIndexItem,
  TimelineEvent,
} from '@jarvis-os/core';
import type { Vault } from '../vault/Vault.js';
import { searchIndex } from '../vault/Vault.js';
import { getBacklinks, getNote } from '../vault/Vault.js';
import type { VectorIndex } from './VectorIndex.js';

export interface ProgressiveDisclosureConfig {
  vault: Vault;
  vectorIndex?: VectorIndex;
  useVectorSearch?: boolean;
  ftsWeight?: number;
  vectorWeight?: number;
}

export class ProgressiveDisclosure {
  private vault: Vault;
  private vectorIndex?: VectorIndex;
  private useVectorSearch: boolean;
  private ftsWeight: number;
  private vectorWeight: number;

  constructor(config: ProgressiveDisclosureConfig) {
    this.vault = config.vault;
    this.vectorIndex = config.vectorIndex;
    this.useVectorSearch = config.useVectorSearch ?? true;
    this.ftsWeight = config.ftsWeight ?? 0.5;
    this.vectorWeight = config.vectorWeight ?? 0.5;
  }

  async searchIndex(query: string, limit = 20): Promise<SearchIndexItem[]> {
    if (this.useVectorSearch && this.vectorIndex) {
      const { hybridSearch } = await import('./VectorIndex.js');
      return hybridSearch(
        this.vault,
        this.vectorIndex,
        query,
        limit,
        this.ftsWeight,
        this.vectorWeight
      );
    }

    return searchIndex(this.vault, { query, limit });
  }

  async getTimeline(around?: string, windowDays = 7): Promise<TimelineEvent[]> {
    const { getTimeline } = await import('../vault/Vault.js');
    return getTimeline(this.vault, around, windowDays);
  }

  async getObservations(ids: string[]): Promise<ObservationDetail[]> {
    const { getObservations } = await import('../vault/Vault.js');
    return getObservations(this.vault, ids);
  }

  async getNote(ref: string): Promise<Note | null> {
    return getNote(this.vault, ref);
  }

  async listNotes(filters: NoteFilters = {}): Promise<Note[]> {
    const { listNotes } = await import('../vault/Vault.js');
    return listNotes(this.vault, filters);
  }

  async getRelatedNotes(ref: string): Promise<SearchIndexItem[]> {
    const note = await this.getNote(ref);
    if (!note) return [];

    const backlinks = await getBacklinks(this.vault, ref);
    const wikilinks = note.frontmatter.wikilinks;

    const related = new Map<string, SearchIndexItem>();

    for (const backlink of backlinks) {
      related.set(backlink.frontmatter.id, {
        id: backlink.frontmatter.id,
        title: backlink.frontmatter.title,
        summary: backlink.frontmatter.summary,
        type: backlink.frontmatter.type,
        agent: backlink.frontmatter.agent,
        tags: backlink.frontmatter.tags,
        createdAt: backlink.frontmatter.createdAt,
        score: 0,
      });
    }

    for (const link of wikilinks) {
      const linkedNote = await this.getNote(link);
      if (linkedNote) {
        related.set(linkedNote.frontmatter.id, {
          id: linkedNote.frontmatter.id,
          title: linkedNote.frontmatter.title,
          summary: linkedNote.frontmatter.summary,
          type: linkedNote.frontmatter.type,
          agent: linkedNote.frontmatter.agent,
          tags: linkedNote.frontmatter.tags,
          createdAt: linkedNote.frontmatter.createdAt,
          score: 0,
        });
      }
    }

    return Array.from(related.values());
  }

  async searchByType(type: string, limit = 20): Promise<SearchIndexItem[]> {
    return searchIndex(this.vault, { query: '', type: type as any, limit });
  }

  async searchByAgent(agent: string, limit = 20): Promise<SearchIndexItem[]> {
    return searchIndex(this.vault, { query: '', agent, limit });
  }

  async searchByTag(tag: string, limit = 20): Promise<SearchIndexItem[]> {
    return searchIndex(this.vault, { query: '', tags: [tag], limit });
  }

  async searchByTask(taskId: string, limit = 20): Promise<SearchIndexItem[]> {
    // SearchIndex doesn't have taskId, use listNotes instead
    const notes = await this.listNotes({ taskId, limit });
    return notes.map((note) => ({
      id: note.frontmatter.id,
      title: note.frontmatter.title,
      summary: note.frontmatter.summary,
      type: note.frontmatter.type,
      agent: note.frontmatter.agent,
      tags: note.frontmatter.tags,
      createdAt: note.frontmatter.createdAt,
      score: 0,
    }));
  }

  async getRecentNotes(limit = 10): Promise<SearchIndexItem[]> {
    const notes = await this.listNotes({ limit, archived: false });
    return notes.map((note) => ({
      id: note.frontmatter.id,
      title: note.frontmatter.title,
      summary: note.frontmatter.summary,
      type: note.frontmatter.type,
      agent: note.frontmatter.agent,
      tags: note.frontmatter.tags,
      createdAt: note.frontmatter.createdAt,
      score: 0,
    }));
  }

  async getPinnedNotes(): Promise<SearchIndexItem[]> {
    const notes = await this.listNotes({ limit: 100, archived: false });
    return notes
      .filter((note) => note.frontmatter.pinned)
      .map((note) => ({
        id: note.frontmatter.id,
        title: note.frontmatter.title,
        summary: note.frontmatter.summary,
        type: note.frontmatter.type,
        agent: note.frontmatter.agent,
        tags: note.frontmatter.tags,
        createdAt: note.frontmatter.createdAt,
        score: 0,
      }));
  }

  async getStats(): Promise<{
    totalNotes: number;
    notesByType: Record<string, number>;
    notesByAgent: Record<string, number>;
    totalEmbeddings: number;
  }> {
    const allNotes = await this.listNotes({ archived: true, limit: 10000 });

    const notesByType: Record<string, number> = {};
    const notesByAgent: Record<string, number> = {};

    for (const note of allNotes) {
      notesByType[note.frontmatter.type] = (notesByType[note.frontmatter.type] || 0) + 1;
      notesByAgent[note.frontmatter.agent] = (notesByAgent[note.frontmatter.agent] || 0) + 1;
    }

    let totalEmbeddings = 0;
    if (this.vectorIndex) {
      const { getCollectionStats } = await import('./VectorIndex.js');
      const stats = await getCollectionStats(this.vectorIndex);
      totalEmbeddings = stats.count;
    }

    return {
      totalNotes: allNotes.length,
      notesByType,
      notesByAgent,
      totalEmbeddings,
    };
  }
}

export function createProgressiveDisclosure(
  config: ProgressiveDisclosureConfig
): ProgressiveDisclosure {
  return new ProgressiveDisclosure(config);
}
