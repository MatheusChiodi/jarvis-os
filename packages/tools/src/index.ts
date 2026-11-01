import type { Tool, ToolRisk } from '@jarvis-os/protocol';
import { listNotes as ftsSearch, saveNote, type Vault } from '@jarvis-os/memory';
import type { ProgressiveDisclosure, VectorIndex } from '@jarvis-os/memory';
import { realpathSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import pino from 'pino';

const logger = pino({ name: 'tools' });

// ============================================================================
// Configuration
// ============================================================================

export interface ToolConfig {
  workspaces: string[];
  maxToolOutputChars: number;
}

export interface ToolExecutionContext {
  sessionId: string;
  vault: Vault;
  vectorIndex?: VectorIndex;
  progressiveDisclosure?: ProgressiveDisclosure;
  config: ToolConfig;
}

// ============================================================================
// Risk Classification
// ============================================================================

const SAFE_COMMANDS = [
  'git status', 'git log', 'git diff', 'git show', 'git branch',
  'ls', 'dir', 'pwd', 'cat', 'type', 'Get-Content', 'Get-ChildItem',
  'rg', 'grep', 'node -v', 'pnpm -v', 'pnpm test', 'pnpm lint', 'pnpm typecheck'
];

const DANGEROUS_PATTERNS = [
  'rm -rf', 'rm -r', 'Remove-Item', 'del /', 'rd /s',
  'format', 'shutdown', 'reg ', 'git push', 'git reset --hard',
  'git clean', 'curl', '| sh', 'iwr', '| iex', 'Invoke-Expression',
  'npm publish', 'pnpm publish'
];

const SENSITIVE_FILE_PATTERNS = [
  '.env', '.pem', '.key', 'id_rsa', 'id_ed25519',
  '.jarvis-os/daemon.token', '.ssh/'
];

function isSafeCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return SAFE_COMMANDS.some(safe => trimmed.startsWith(safe));
}

function isDangerousCommand(cmd: string): boolean {
  const trimmed = cmd.trim().toLowerCase();
  return DANGEROUS_PATTERNS.some(pattern => trimmed.includes(pattern.toLowerCase()));
}

function hasShellOperators(cmd: string): boolean {
  return /[;&|]|\$\s*\(/.test(cmd);
}

function splitCommands(cmd: string): string[] {
  return cmd.split(/[;&|]/).map(s => s.trim()).filter(Boolean);
}

function classifyShellCommand(cmd: string): ToolRisk {
  const segments = splitCommands(cmd);
  let maxRisk: ToolRisk = 'safe';
  
  for (const segment of segments) {
    if (isDangerousCommand(segment)) {
      return 'dangerous';
    }
    if (hasShellOperators(segment) || !isSafeCommand(segment)) {
      maxRisk = 'dangerous';
    }
  }
  
  return maxRisk;
}

// ============================================================================
// Path Sandbox
// ============================================================================

export function resolveWorkspacePath(path: string, workspaces: string[]): string {
  if (!isAbsolute(path)) {
    throw new Error(`Path must be absolute: ${path}`);
  }

  const resolved = realpathSync(path);
  
  for (const ws of workspaces) {
    const wsResolved = realpathSync(ws);
    const rel = relative(wsResolved, resolved);
    if (!rel.startsWith('..') && rel !== '') {
      return resolved;
    }
  }

  throw new Error(`Path ${path} is outside all allowed workspaces`);
}

function isSensitivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return SENSITIVE_FILE_PATTERNS.some(pattern => 
    normalized.includes(pattern.replace(/\\/g, '/'))
  );
}

function classifyFileOperation(path: string, isWrite: boolean): ToolRisk {
  if (isSensitivePath(path)) return 'dangerous';
  if (isWrite) return 'write';
  return 'safe';
}

// ============================================================================
// Audit Logging
// ============================================================================

interface AuditEntry {
  ts: string;
  sessionId: string;
  tool: string;
  args: Record<string, unknown>;
  risk: ToolRisk;
  decision: 'approved' | 'denied' | 'auto';
  durationMs: number;
  exitCode?: number;
  outputChars?: number;
}

const auditLogPath = resolve(process.env.HOME || process.env.USERPROFILE || '', '.jarvis-os', 'logs', 'audit.jsonl');

function writeAuditEntry(entry: AuditEntry): void {
  try {
    const dir = resolve(auditLogPath, '..');
    if (!existsSync(dir)) {
      require('node:fs').mkdirSync(dir, { recursive: true });
    }
    require('node:fs').appendFileSync(auditLogPath, JSON.stringify(entry) + '\n');
  } catch (error) {
    logger.error({ error }, 'Failed to write audit log');
  }
}

// ============================================================================
// Shell Execution
// ============================================================================

async function executeShellCommand(
  cmd: string, 
  cwd: string, 
  timeoutMs: number,
  maxOutputChars: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : 'bash';
    const args = isWindows 
      ? ['-NoProfile', '-NonInteractive', '-Command', cmd]
      : ['-lc', cmd];

    const child: ChildProcess = spawn(shell, args, { 
      cwd, 
      timeout: timeoutMs
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const killTimer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > maxOutputChars) {
        stdout = stdout.slice(0, maxOutputChars) + `\n…[truncated ${stdout.length - maxOutputChars} characters]`;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err: Error) => {
      clearTimeout(killTimer);
      if (!killed) reject(err);
    });

    child.on('close', (code: number | null) => {
      clearTimeout(killTimer);
      if (killed) {
        resolve({ stdout, stderr, exitCode: -1 });
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      }
    });
  });
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const toolDefinitions: Tool[] = [
  {
    name: 'fs_read',
    description: 'Read a file from the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'fs_write',
    description: 'Write a file to the workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'fs_list',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' }
      },
      required: ['path']
    }
  },
  {
    name: 'shell_run',
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory (must be within workspace)' }
      },
      required: ['command', 'cwd']
    }
  },
  {
    name: 'memory_search',
    description: 'Search memory using hybrid FTS + vector search',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 20 },
        type: { type: 'string', description: 'Filter by note type' },
        agent: { type: 'string', description: 'Filter by agent' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_save',
    description: 'Save a note to memory',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content' },
        type: { type: 'string', enum: ['memory', 'decision', 'learning', 'communication', 'state'] },
        tags: { type: 'array', items: { type: 'string' }, default: [] },
        agent: { type: 'string', description: 'Agent identifier' },
        taskId: { type: 'string', description: 'Task identifier' }
      },
      required: ['title', 'content', 'type', 'agent']
    }
  }
];

// ============================================================================
// Tool Executors
// ============================================================================

export async function executeTool(
  name: string, 
  args: Record<string, unknown>, 
  context: ToolExecutionContext
): Promise<{ output: string; risk: ToolRisk; riskReason?: string }> {
  const startTime = Date.now();
  
  try {
    switch (name) {
      case 'fs_read': {
        const path = resolveWorkspacePath(args.path as string, context.config.workspaces);
        const risk = classifyFileOperation(path, false);
        
        const fs = await import('node:fs/promises');
        const content = await fs.readFile(path, 'utf-8');
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: 'auto',
          durationMs: Date.now() - startTime,
          outputChars: content.length
        });
        
        return { output: content, risk };
      }

      case 'fs_write': {
        const path = resolveWorkspacePath(args.path as string, context.config.workspaces);
        const risk = classifyFileOperation(path, true);
        
        const fs = await import('node:fs/promises');
        await fs.writeFile(path, args.content as string, 'utf-8');
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: risk === 'write' ? 'auto' : 'approved',
          durationMs: Date.now() - startTime,
          outputChars: (args.content as string).length
        });
        
        return { output: `Written ${(args.content as string).length} bytes to ${path}`, risk };
      }

      case 'fs_list': {
        const path = resolveWorkspacePath(args.path as string, context.config.workspaces);
        const risk = classifyFileOperation(path, false);
        
        const fs = await import('node:fs/promises');
        const entries = await fs.readdir(path, { withFileTypes: true });
        const files = entries.map(e => ({
          name: e.name,
          isDirectory: e.isDirectory(),
          isFile: e.isFile()
        }));
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: 'auto',
          durationMs: Date.now() - startTime,
          outputChars: JSON.stringify(files).length
        });
        
        return { output: JSON.stringify(files, null, 2), risk };
      }

      case 'shell_run': {
        const cwd = resolveWorkspacePath(args.cwd as string, context.config.workspaces);
        const command = args.command as string;
        const risk = classifyShellCommand(command);
        
        const result = await executeShellCommand(
          command, 
          cwd, 
          120000, 
          context.config.maxToolOutputChars
        );
        
        const output = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : '');
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: risk === 'dangerous' ? 'approved' : 'auto',
          durationMs: Date.now() - startTime,
          exitCode: result.exitCode,
          outputChars: output.length
        });
        
        return { 
          output: output.slice(0, context.config.maxToolOutputChars), 
          risk,
          riskReason: risk === 'dangerous' ? 'Command classified as dangerous' : undefined
        };
      }

      case 'memory_search': {
        const risk: ToolRisk = 'safe';
        const options = {
          query: args.query as string,
          limit: (args.limit as number) || 20,
          type: args.type as any,
          agent: args.agent as string
        };
        
        let results;
        if (context.progressiveDisclosure) {
          results = await context.progressiveDisclosure.searchIndex(options.query, options.limit);
        } else {
          results = await ftsSearch(context.vault, options);
        }
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: 'auto',
          durationMs: Date.now() - startTime,
          outputChars: JSON.stringify(results).length
        });
        
        return { output: JSON.stringify(results, null, 2), risk };
      }

      case 'memory_save': {
        const risk: ToolRisk = 'write';
        
        const note = await saveNote(context.vault, {
          frontmatter: {
            id: crypto.randomUUID(),
            type: args.type as any,
            title: args.title as string,
            summary: (args.content as string).slice(0, 200),
            tags: (args.tags as string[]) || [],
            agent: args.agent as string,
            taskId: args.taskId as string,
            project: context.vault.projectId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wikilinks: [],
            pinned: false,
            archived: false
          },
          content: args.content as string
        });
        
        writeAuditEntry({
          ts: new Date().toISOString(),
          sessionId: context.sessionId,
          tool: name,
          args,
          risk,
          decision: 'auto',
          durationMs: Date.now() - startTime,
          outputChars: JSON.stringify(note).length
        });
        
        return { output: `Saved note ${note.frontmatter.id}`, risk };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    writeAuditEntry({
      ts: new Date().toISOString(),
      sessionId: context.sessionId,
      tool: name,
      args,
      risk: 'dangerous',
      decision: 'denied',
      durationMs: Date.now() - startTime
    });
    throw error;
  }
}

export function getToolDefinition(name: string): Tool | undefined {
  return toolDefinitions.find(t => t.name === name);
}

export function getAllToolDefinitions(): Tool[] {
  return toolDefinitions;
}

export function classifyToolRisk(name: string, args: Record<string, unknown>, workspaces: string[]): ToolRisk {
  switch (name) {
    case 'fs_read':
    case 'fs_list':
      return classifyFileOperation(resolveWorkspacePath(args.path as string, workspaces), false);
    case 'fs_write':
      return classifyFileOperation(resolveWorkspacePath(args.path as string, workspaces), true);
    case 'shell_run':
      return classifyShellCommand(args.command as string);
    case 'memory_search':
    case 'memory_save':
      return 'safe';
    default:
      return 'dangerous';
  }
}