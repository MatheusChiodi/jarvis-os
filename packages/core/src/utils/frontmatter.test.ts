import { describe, expect, it } from 'vitest';
import {
  extractHeadings,
  extractWikilinks,
  generateId,
  nowISO,
  parseFrontmatter,
  serializeFrontmatter,
  slugify,
} from './index';

describe('core/utils', () => {
  describe('parseFrontmatter', () => {
    it('parses valid frontmatter', () => {
      const content = `---
id: "123e4567-e89b-12d3-a456-426614174000"
type: "memory"
title: "Test Note"
summary: "A test note"
tags: ["test", "demo"]
agent: "planner"
project: "test-project"
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-01T00:00:00.000Z"
wikilinks: []
pinned: false
archived: false
---
# Test Note

This is the body content.`;

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result?.frontmatter.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result?.frontmatter.type).toBe('memory');
      expect(result?.frontmatter.title).toBe('Test Note');
      expect(result?.body).toContain('This is the body content.');
    });

    it('returns null for content without frontmatter', () => {
      const content = '# Just a heading\n\nNo frontmatter here.';
      const result = parseFrontmatter(content);
      expect(result).toBeNull();
    });
  });

  describe('serializeFrontmatter', () => {
    it('serializes frontmatter to YAML', () => {
      const frontmatter = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'memory' as const,
        title: 'Test Note',
        summary: 'A test note',
        tags: ['test', 'demo'],
        agent: 'planner',
        project: 'test-project',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        wikilinks: [],
        pinned: false,
        archived: false,
      };

      const serialized = serializeFrontmatter(frontmatter);
      expect(serialized).toContain('id: "123e4567-e89b-12d3-a456-426614174000"');
      expect(serialized).toContain('type: "memory"');
      expect(serialized).toContain('title: "Test Note"');
      expect(serialized).toContain('tags: ["test","demo"]');
      expect(serialized.startsWith('---\n')).toBe(true);
      expect(serialized.endsWith('\n---')).toBe(true);
    });
  });

  describe('generateId', () => {
    it('generates valid UUID', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('slugify', () => {
    it('converts text to slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test Note Title')).toBe('test-note-title');
      expect(slugify('Special Chars!@#$%')).toBe('special-chars');
      expect(slugify('  Leading and Trailing  ')).toBe('leading-and-trailing');
      expect(slugify('Café naïve')).toBe('cafe-naive');
    });
  });

  describe('nowISO', () => {
    it('returns valid ISO string', () => {
      const iso = nowISO();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('extractWikilinks', () => {
    it('extracts wikilinks from content', () => {
      const content = 'See [[Note One]] and [[Note Two]] for details. Also [[Note One]] again.';
      const links = extractWikilinks(content);
      expect(links).toEqual(['Note One', 'Note Two']);
    });

    it('returns empty array for no wikilinks', () => {
      expect(extractWikilinks('No links here.')).toEqual([]);
    });
  });

  describe('extractHeadings', () => {
    it('extracts headings with levels', () => {
      const content = '# H1\n## H2\n### H3\nSome text\n## Another H2';
      const headings = extractHeadings(content);
      expect(headings).toEqual([
        { level: 1, text: 'H1' },
        { level: 2, text: 'H2' },
        { level: 3, text: 'H3' },
        { level: 2, text: 'Another H2' },
      ]);
    });
  });
});
