import { describe, expect, it } from 'vitest';
import {
  classifyToolRisk,
  resolveWorkspacePath,
  getToolDefinition,
  getAllToolDefinitions,
  toolDefinitions,
} from './index';

const testWorkspaces = ['/home/user/project'];

describe('tools', () => {
  describe('classifyToolRisk', () => {
    it('classifies fs_read as safe', () => {
      const risk = classifyToolRisk('fs_read', { path: '/home/user/project/file.txt' }, testWorkspaces);
      expect(risk).toBe('safe');
    });

    it('classifies fs_write as write', () => {
      const risk = classifyToolRisk('fs_write', { path: '/home/user/project/file.txt', content: 'test' }, testWorkspaces);
      expect(risk).toBe('write');
    });

    it('classifies fs_list as safe', () => {
      const risk = classifyToolRisk('fs_list', { path: '/home/user/project' }, testWorkspaces);
      expect(risk).toBe('safe');
    });

    it('classifies memory_search as safe', () => {
      const risk = classifyToolRisk('memory_search', { query: 'test' }, testWorkspaces);
      expect(risk).toBe('safe');
    });

    it('classifies memory_save as safe', () => {
      const risk = classifyToolRisk('memory_save', { title: 'Test', content: 'Test', type: 'memory', agent: 'test' }, testWorkspaces);
      expect(risk).toBe('safe');
    });

    it('classifies shell_run safe command as safe', () => {
      const risk = classifyToolRisk('shell_run', { command: 'git status', cwd: '/home/user/project' }, testWorkspaces);
      expect(risk).toBe('safe');
    });

    it('classifies shell_run with shell operators as dangerous', () => {
      const risk = classifyToolRisk('shell_run', { command: 'echo test; rm -rf /', cwd: '/home/user/project' }, testWorkspaces);
      expect(risk).toBe('dangerous');
    });

    it('classifies unknown tool as dangerous', () => {
      const risk = classifyToolRisk('unknown_tool', {}, testWorkspaces);
      expect(risk).toBe('dangerous');
    });
  });

  describe('resolveWorkspacePath', () => {
    it('resolves absolute path within workspace', () => {
      const resolved = resolveWorkspacePath('/home/user/project/src/file.ts', testWorkspaces);
      expect(resolved).toBe('/home/user/project/src/file.ts');
    });

    it('throws for relative path', () => {
      expect(() => resolveWorkspacePath('src/file.ts', testWorkspaces)).toThrow('Path must be absolute');
    });

    it('throws for path outside workspace', () => {
      expect(() => resolveWorkspacePath('/etc/passwd', testWorkspaces)).toThrow('outside all allowed workspaces');
    });
  });

  describe('toolDefinitions', () => {
    it('exports tool definitions array', () => {
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('includes fs_read tool', () => {
      const tool = getToolDefinition('fs_read');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('fs_read');
      expect(tool?.parameters.required).toContain('path');
    });

    it('includes fs_write tool', () => {
      const tool = getToolDefinition('fs_write');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('fs_write');
      expect(tool?.parameters.required).toContain('path');
      expect(tool?.parameters.required).toContain('content');
    });

    it('includes shell_run tool', () => {
      const tool = getToolDefinition('shell_run');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('shell_run');
      expect(tool?.parameters.required).toContain('command');
      expect(tool?.parameters.required).toContain('cwd');
    });

    it('includes memory_search tool', () => {
      const tool = getToolDefinition('memory_search');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('memory_search');
      expect(tool?.parameters.required).toContain('query');
    });

    it('includes memory_save tool', () => {
      const tool = getToolDefinition('memory_save');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('memory_save');
      expect(tool?.parameters.required).toContain('title');
      expect(tool?.parameters.required).toContain('content');
      expect(tool?.parameters.required).toContain('type');
      expect(tool?.parameters.required).toContain('agent');
    });

    it('getAllToolDefinitions returns all tools', () => {
      const all = getAllToolDefinitions();
      expect(all.length).toBe(toolDefinitions.length);
      expect(all.map(t => t.name).sort()).toEqual([
        'fs_list',
        'fs_read',
        'fs_write',
        'memory_save',
        'memory_search',
        'shell_run',
      ].sort());
    });
  });
});