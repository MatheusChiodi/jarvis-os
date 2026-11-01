import { generateId, nowISO } from '@jarvis-os/core';
import type { Plan, PlanPhase, Task, TaskResult, ExecutionResult } from '@jarvis-os/core';
import { WorktreeManager } from '../git/WorktreeManager';
import { TddEnforcer } from '../tdd/TddEnforcer';
import { CodeReviewer } from '../review/CodeReviewer';
import { VerificationRunner } from '../verification/VerificationRunner';

interface ExecutorOptions {
  worktreeManager: WorktreeManager;
  tddEnforcer: TddEnforcer;
  codeReviewer: CodeReviewer;
  verificationRunner: VerificationRunner;
}

export class PlanExecutor {
  private worktreeManager: WorktreeManager;
  private tddEnforcer: TddEnforcer;
  private codeReviewer: CodeReviewer;
  private verificationRunner: VerificationRunner;

  constructor(options: ExecutorOptions) {
    this.worktreeManager = options.worktreeManager;
    this.tddEnforcer = options.tddEnforcer;
    this.codeReviewer = options.codeReviewer;
    this.verificationRunner = options.verificationRunner;
  }

  async execute(plan: Plan, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    const results: TaskResult[] = [];

    for (const phase of plan.phases) {
      // Create worktree for this phase
      const branchName = `jarvis/${plan.id}/${phase.id}`;
      let worktreePath: string;

      try {
        worktreePath = await this.worktreeManager.createWorktree(branchName, plan.teamId);
      } catch (error) {
        return {
          planId: plan.id,
          results,
          success: false,
          error: `Failed to create worktree: ${error}`,
        };
      }

      try {
        // Execute tasks in phase
        const phaseResults = await this.executePhase(phase, worktreePath, options);
        results.push(...phaseResults);

        // Check if all tasks passed
        const allPassed = phaseResults.every(r => r.success);
        if (!allPassed) {
          return {
            planId: plan.id,
            results,
            success: false,
            error: `Phase ${phase.name} failed`,
          };
        }

        // Commit phase changes
        await this.commitPhase(worktreePath, phase.id);

      } finally {
        // Cleanup worktree (keep if failed for debugging)
        const allPassed = phaseResults.every(r => r.success);
        if (allPassed) {
          await this.worktreeManager.removeWorktree(branchName);
        } else {
          await this.worktreeManager.removeWorktree(branchName, true); // force
        }
      }
    }

    // Final verification
    const verification = await this.verificationRunner.verify(plan.id);
    if (!verification.passed) {
      return {
        planId: plan.id,
        results,
        success: false,
        error: 'Final verification failed',
      };
    }

    return { planId: plan.id, results, success: true };
  }

  private async executePhase(
    phase: PlanPhase,
    worktreePath: string,
    options: ExecuteOptions
  ): Promise<TaskResult[]> {
    const tasks = phase.tasks;
    const results: TaskResult[] = [];
    const completed = new Set<string>();

    // Build dependency graph
    const dag = this.buildTaskDag(tasks);

    while (completed.size < tasks.length) {
      // Find ready tasks (all deps completed)
      const ready = tasks.filter(t =>
        !completed.has(t.id) &&
        t.dependencies.every(d => completed.has(d))
      );

      if (ready.length === 0) {
        throw new Error('Circular dependency detected in tasks');
      }

      // Execute ready tasks in parallel (respecting maxConcurrency)
      const concurrency = options.maxConcurrency || 3;
      const batches = this.chunkArray(ready, concurrency);

      for (const batch of batches) {
        const batchPromises = batch.map(task =>
          this.executeTask(task, worktreePath, options)
        );
        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          results.push(result);
          completed.add(result.taskId);

          if (!result.success) {
            return results; // Stop on first failure
          }
        }
      }
    }

    return results;
  }

  private async executeTask(
    task: Task,
    worktreePath: string,
    options: ExecuteOptions
  ): Promise<TaskResult> {
    const start = Date.now();

    try {
      // TDD Loop: Red -> Green -> Refactor
      const tddResult = await this.tddEnforcer.enforce(task, worktreePath);
      if (!tddResult.success) {
        return { taskId: task.id, success: false, error: tddResult.error, duration: Date.now() - start };
      }

      // Code Review
      const reviewResult = await this.codeReviewer.review(task, worktreePath);
      if (!reviewResult.passed) {
        return {
          taskId: task.id,
          success: false,
          error: `Code review failed: ${reviewResult.issues.map(i => i.message).join(', ')}`,
          duration: Date.now() - start,
        };
      }

      return {
        taskId: task.id,
        success: true,
        output: { tdd: tddResult, review: reviewResult },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - start,
      };
    }
  }

  private async commitPhase(worktreePath: string, phaseId: string): Promise<void> {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(worktreePath);
    await git.add('.');
    await git.commit(`jarvis: phase ${phaseId} completed`);
  }

  private buildTaskDag(tasks: Task[]): Map<string, string[]> {
    const dag = new Map<string, string[]>();
    for (const task of tasks) {
      dag.set(task.id, [...task.dependencies]);
    }
    return dag;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

interface ExecuteOptions {
  parallel?: boolean;
  maxConcurrency?: number;
  checkpoint?: boolean;
}

export function createPlanExecutor(options: ExecutorOptions): PlanExecutor {
  return new PlanExecutor(options);
}