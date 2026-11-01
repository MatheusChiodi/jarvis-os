import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  locked: boolean;
  prunable: boolean;
}

export class WorktreeManager {
  private git: SimpleGit;
  private baseWorktreeDir: string;

  constructor(projectRoot: string) {
    this.git = simpleGit(projectRoot);
    this.baseWorktreeDir = join(tmpdir(), 'jarvis-worktrees', this.hashPath(projectRoot));
  }

  async init(): Promise<void> {
    await this.git.status(); // Validates git repo
  }

  async createWorktree(branchName: string, baseBranch = 'main'): Promise<string> {
    const worktreePath = join(this.baseWorktreeDir, branchName);

    // Ensure base branch exists
    const branches = await this.git.branchLocal();
    if (!branches.all.includes(baseBranch)) {
      throw new Error(`Base branch not found: ${baseBranch}`);
    }

    // Create branch if not exists
    if (!branches.all.includes(branchName)) {
      await this.git.checkoutLocalBranch(branchName, [baseBranch]);
    } else {
      await this.git.checkout(branchName);
    }

    // Add worktree
    await this.git.raw(['worktree', 'add', worktreePath, branchName]);

    return worktreePath;
  }

  async removeWorktree(branchName: string, force = false): Promise<void> {
    const worktrees = await this.listWorktrees();
    const wt = worktrees.find((w) => w.branch === branchName);

    if (!wt) return; // Already removed

    try {
      await this.git.raw(['worktree', 'remove', force ? '--force' : '', wt.path]);
    } catch (error) {
      if (force) {
        // Force remove: delete directory + prune
        const { rm } = await import('node:fs/promises');
        await rm(wt.path, { recursive: true, force: true });
        await this.git.raw(['worktree', 'prune']);
      } else {
        throw error;
      }
    }

    // Delete branch if merged
    const merged = await this.isBranchMerged(branchName);
    if (merged) {
      await this.git.deleteLocalBranch(branchName);
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.git.raw(['worktree', 'list', '--porcelain']);
    return this.parseWorktreeList(output);
  }

  async getWorktreePath(branchName: string): Promise<string | null> {
    const worktrees = await this.listWorktrees();
    return worktrees.find((w) => w.branch === branchName)?.path || null;
  }

  async isBranchMerged(branchName: string): Promise<boolean> {
    try {
      const merged = await this.git.raw(['branch', '--merged', 'main']);
      return merged
        .split('\n')
        .some((l) => l.trim() === branchName || l.trim() === `* ${branchName}`);
    } catch {
      return false;
    }
  }

  async cleanupPrunable(): Promise<number> {
    const worktrees = await this.listWorktrees();
    let removed = 0;

    for (const wt of worktrees) {
      if (wt.prunable && !wt.locked) {
        await this.removeWorktree(wt.branch, true);
        removed++;
      }
    }

    return removed;
  }

  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path) worktrees.push(current as WorktreeInfo);
        current = { path: line.slice(9).trim() };
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.slice(5).trim();
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).trim().replace('refs/heads/', '');
      } else if (line === 'locked') {
        current.locked = true;
      } else if (line === 'prunable') {
        current.prunable = true;
      }
    }
    if (current.path) worktrees.push(current as WorktreeInfo);

    return worktrees;
  }

  private hashPath(path: string): string {
    return createHash('sha256').update(path).digest('hex').slice(0, 16);
  }
}

export function createWorktreeManager(projectRoot: string): WorktreeManager {
  return new WorktreeManager(projectRoot);
}
