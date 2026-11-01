import { z } from 'zod';
import type { NoteFrontmatter } from '../types/index.js';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const NoteTypeSchema = z.enum(['memory', 'decision', 'learning', 'communication', 'state']);
export const AgentRoleTypeSchema = z.enum([
  'planner',
  'architect',
  'coder',
  'reviewer',
  'tester',
  'researcher',
  'docs',
  'custom',
]);

export const NoteFrontmatterSchema = z.object({
  id: z.string().uuid(),
  type: NoteTypeSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  tags: z.array(z.string()).default([]),
  agent: z.string().min(1),
  taskId: z.string().optional(),
  project: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  wikilinks: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  archived: z.boolean().default(false),
});

export type ValidatedNoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;

// ============================================================================
// FRONTMATTER PARSING
// ============================================================================

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

export function parseFrontmatter(
  content: string
): { frontmatter: NoteFrontmatter; body: string } | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match || !match[1]) return null;

  try {
    const yamlContent = match[1];
    const frontmatter = parseYaml(yamlContent);
    const validated = NoteFrontmatterSchema.parse(frontmatter);
    const body = content.slice(match[0].length).trimStart();
    return { frontmatter: validated, body };
  } catch {
    return null;
  }
}

export function serializeFrontmatter(frontmatter: NoteFrontmatter): string {
  const lines: string[] = ['---'];
  const order = [
    'id',
    'type',
    'title',
    'summary',
    'tags',
    'agent',
    'taskId',
    'project',
    'createdAt',
    'updatedAt',
    'wikilinks',
    'pinned',
    'archived',
  ];

  for (const key of order) {
    const value = frontmatter[key as keyof NoteFrontmatter];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: "${String(value).replace(/"/g, '\\"')}"`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    if (!key) continue;

    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value.replace(/^"|"$/g, '');
    }
  }
  return result;
}

// ============================================================================
// ID GENERATION
// ============================================================================

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateShortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

export function nowISO(): string {
  return new Date().toISOString();
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

export function joinPaths(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}

export function getRelativePath(from: string, to: string): string {
  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);

  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i++;
  }

  const up = '../'.repeat(fromParts.length - i);
  const down = toParts.slice(i).join('/');
  return up + down;
}

// ============================================================================
// MARKDOWN UTILITIES
// ============================================================================

export function extractWikilinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) links.push(match[1].trim());
  }
  return [...new Set(links)];
}

export function extractHeadings(content: string): { level: number; text: string }[] {
  const regex = /^(#{1,6})\s+(.+)$/gm;
  const headings: { level: number; text: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1] && match[2]) headings.push({ level: match[1].length, text: match[2].trim() });
  }
  return headings;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateNoteFrontmatter(data: unknown): ValidatedNoteFrontmatter {
  return NoteFrontmatterSchema.parse(data);
}

export function safeParse<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
