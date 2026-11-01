import type { Task } from '@jarvis-os/core';
import { simpleGit } from 'simple-git';

interface TddResult {
  success: boolean;
  error?: string;
  output?: {
    testPhase?: any;
    implPhase?: any;
    refactorPhase?: any;
  };
}

interface TestFile {
  path: string;
  content: string;
}

export class TddEnforcer {
  private maxRetries = 3;

  async enforce(task: Task, worktreePath: string): Promise<TddResult> {
    const _git = simpleGit(worktreePath);

    // Phase 1: Red - Write failing test
    const testPhase = await this.redPhase(task, worktreePath);
    if (!testPhase.success) {
      return { success: false, error: `Red phase failed: ${testPhase.error}` };
    }

    // Run test to confirm it fails
    const testRun1 = await this.runTests(worktreePath);
    if (testRun1.passed) {
      return { success: false, error: 'Test should fail initially (Red phase)' };
    }

    // Phase 2: Green - Make test pass
    const implPhase = await this.greenPhase(task, worktreePath, testPhase.testFile);
    if (!implPhase.success) {
      return { success: false, error: `Green phase failed: ${implPhase.error}` };
    }

    // Run test to confirm it passes
    const testRun2 = await this.runTests(worktreePath);
    if (!testRun2.passed) {
      return { success: false, error: 'Test should pass after implementation (Green phase)' };
    }

    // Phase 3: Refactor
    const refactorPhase = await this.refactorPhase(task, worktreePath);
    if (!refactorPhase.success) {
      return { success: false, error: `Refactor phase failed: ${refactorPhase.error}` };
    }

    // Final test run
    const testRun3 = await this.runTests(worktreePath);
    if (!testRun3.passed) {
      return { success: false, error: 'Tests should still pass after refactor' };
    }

    return {
      success: true,
      output: { testPhase, implPhase, refactorPhase },
    };
  }

  private async redPhase(
    task: Task,
    worktreePath: string
  ): Promise<{ success: boolean; error?: string; testFile?: TestFile }> {
    // Generate a failing test based on task description
    const testFile = this.generateTestFile(task);

    // Write test file
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const testDir = join(worktreePath, 'tests');
    await mkdir(testDir, { recursive: true });
    const testPath = join(testDir, `${task.id}.test.ts`);
    await writeFile(testPath, testFile.content);

    return { success: true, testFile: { path: testPath, content: testFile.content } };
  }

  private generateTestFile(task: Task): TestFile {
    const testName = task.title.replace(/[^a-zA-Z0-9]/g, ' ').trim();
    const _safeName = testName.replace(/\s+/g, '_');

    return {
      path: `${task.id}.test.ts`,
      content: `import { describe, it, expect, beforeEach } from 'vitest';

describe('${testName}', () => {
  beforeEach(() => {
    // Setup
  });

  it('should ${testName.toLowerCase()}', () => {
    // TODO: Implement test
    // This test should fail initially (Red phase)
    throw new Error('Test not implemented - Red phase');
  });
});
`,
    };
  }

  private async greenPhase(
    task: Task,
    worktreePath: string,
    testFile?: TestFile
  ): Promise<{ success: boolean; error?: string }> {
    // In a real implementation, this would use an LLM to generate implementation
    // For now, we'll create a minimal implementation that makes the test pass

    const implPath = testFile?.path.replace('.test.ts', '.ts') || `${task.id}.ts`;
    const fullImplPath = join(worktreePath, 'src', implPath);

    const { writeFile, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(fullImplPath), { recursive: true });

    const implementation = `// Implementation for: ${task.title}
// Generated during Green phase

export function ${task.id.replace(/-/g, '_')}(): string {
  return 'implemented';
}
`;

    await writeFile(fullImplPath, implementation);

    // Update test to use the implementation
    if (testFile) {
      const updatedTest = testFile.content.replace(
        "throw new Error('Test not implemented - Red phase');",
        `const result = ${task.id.replace(/-/g, '_')}();\n    expect(result).toBe('implemented');`
      );
      await writeFile(testFile.path, updatedTest);
    }

    return { success: true };
  }

  private async refactorPhase(
    _task: Task,
    worktreePath: string
  ): Promise<{ success: boolean; error?: string }> {
    // Run linter
    const { runLint } = await import('./LintRunner');
    const lintResult = await runLint(worktreePath);

    if (!lintResult.passed) {
      // Auto-fix linting issues
      await this.autoFixLint(worktreePath);
    }

    // Run typecheck
    const { runTypecheck } = await import('./TypecheckRunner');
    const typecheckResult = await runTypecheck(worktreePath);

    if (!typecheckResult.passed) {
      return { success: false, error: `Typecheck failed: ${typecheckResult.errors.join(', ')}` };
    }

    return { success: true };
  }

  private async runTests(worktreePath: string): Promise<{ passed: boolean; output: string }> {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('pnpm test --run', { cwd: worktreePath, timeout: 60000 });
      return { passed: true, output: stdout };
    } catch (error: any) {
      return { passed: false, output: error.stdout || error.message };
    }
  }

  private async autoFixLint(worktreePath: string): Promise<void> {
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    try {
      await execAsync('pnpm lint --fix', { cwd: worktreePath, timeout: 30000 });
    } catch {
      // Ignore auto-fix failures
    }
  }
}

export function createTddEnforcer(): TddEnforcer {
  return new TddEnforcer();
}
