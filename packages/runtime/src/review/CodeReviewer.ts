import type { Task } from '@jarvis-os/core';
import { simpleGit, SimpleGit } from 'simple-git';

interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  file: string;
  line?: number;
  column?: number;
  message: string;
  suggestion?: string;
  rule?: string;
}

interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
  summary: {
    critical: number;
    major: number;
    minor: number;
    info: number;
  };
}

export class CodeReviewer {
  private minSeverityToBlock: 'critical' | 'major' | 'minor' | 'info' = 'major';

  async review(task: Task, worktreePath: string): Promise<ReviewResult> {
    const issues: ReviewIssue[] = [];

    // Get changed files
    const changedFiles = await this.getChangedFiles(worktreePath);

    // Phase 1: Spec Compliance Review
    const specIssues = await this.reviewSpecCompliance(task, worktreePath, changedFiles);
    issues.push(...specIssues);

    // Phase 2: Code Quality Review
    const qualityIssues = await this.reviewCodeQuality(worktreePath, changedFiles);
    issues.push(...qualityIssues);

    // Phase 3: Security Review
    const securityIssues = await this.reviewSecurity(worktreePath, changedFiles);
    issues.push(...securityIssues);

    // Phase 4: Performance Review
    const perfIssues = await this.reviewPerformance(worktreePath, changedFiles);
    issues.push(...perfIssues);

    // Calculate summary
    const summary = {
      critical: issues.filter(i => i.severity === 'critical').length,
      major: issues.filter(i => i.severity === 'major').length,
      minor: issues.filter(i => i.severity === 'minor').length,
      info: issues.filter(i => i.severity === 'info').length,
    };

    // Determine if review passes
    const blockingIssues = issues.filter(i =>
      i.severity === 'critical' ||
      (i.severity === 'major' && this.minSeverityToBlock === 'major')
    );

    return {
      passed: blockingIssues.length === 0,
      issues,
      summary,
    };
  }

  private async getChangedFiles(worktreePath: string): Promise<string[]> {
    const git = simpleGit(worktreePath);
    const status = await git.status();
    return [...status.modified, ...status.created, ...status.deleted];
  }

  private async reviewSpecCompliance(
    task: Task,
    worktreePath: string,
    files: string[]
  ): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // Check if task requirements are addressed
    // This would compare implementation against task description
    // For now, basic checks

    for (const file of files) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        // Verify test exists for the task
        const testContent = await this.readFile(worktreePath, file);
        if (!testContent || testContent.includes('Test not implemented')) {
          issues.push({
            severity: 'major',
            file,
            message: 'Test appears to be not implemented (placeholder)',
            suggestion: 'Implement actual test assertions',
            rule: 'spec-compliance:test-implemented',
          });
        }
      }
    }

    return issues;
  }

  private async reviewCodeQuality(
    worktreePath: string,
    files: string[]
  ): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    for (const file of files) {
      if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;

      const content = await this.readFile(worktreePath, file);
      if (!content) continue;

      // Check for common issues
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Long lines
        if (line.length > 120) {
          issues.push({
            severity: 'minor',
            file,
            line: lineNum,
            message: `Line exceeds 120 characters (${line.length})`,
            suggestion: 'Break line into multiple lines',
            rule: 'code-quality:line-length',
          });
        }

        // TODO comments
        if (line.includes('TODO') || line.includes('FIXME')) {
          issues.push({
            severity: 'info',
            file,
            line: lineNum,
            message: 'TODO/FIXME comment found',
            suggestion: 'Create issue tracker entry and remove comment',
            rule: 'code-quality:todo-comment',
          });
        }

        // Console.log in production code
        if (line.includes('console.log') && !file.includes('.test.')) {
          issues.push({
            severity: 'minor',
            file,
            line: lineNum,
            message: 'console.log found in production code',
            suggestion: 'Use proper logging library or remove',
            rule: 'code-quality:console-log',
          });
        }

        // Empty catch blocks
        if (line.match(/catch\s*\(\s*\)\s*\{\s*\}/) || line.match(/catch\s*\([^)]*\)\s*\{\s*\}/)) {
          issues.push({
            severity: 'major',
            file,
            line: lineNum,
            message: 'Empty catch block',
            suggestion: 'Handle or log the error',
            rule: 'code-quality:empty-catch',
          });
        }

        // Magic numbers
        const magicNumberMatch = line.match(/\b\d{3,}\b/);
        if (magicNumberMatch && !line.includes('//') && !line.includes('test')) {
          issues.push({
            severity: 'info',
            file,
            line: lineNum,
            message: 'Possible magic number',
            suggestion: 'Extract to named constant',
            rule: 'code-quality:magic-number',
          });
        }
      }

      // File length
      if (lines.length > 500) {
        issues.push({
          severity: 'minor',
          file,
          message: `File is very long (${lines.length} lines)`,
          suggestion: 'Consider splitting into smaller modules',
          rule: 'code-quality:file-length',
        });
      }
    }

    return issues;
  }

  private async reviewSecurity(worktreePath: string, files: string[]): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    const securityPatterns = [
      { pattern: /password\s*=\s*['"][^'"]+['"]/i, message: 'Hardcoded password', severity: 'critical' as const },
      { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/i, message: 'Hardcoded API key', severity: 'critical' as const },
      { pattern: /secret\s*=\s*['"][^'"]+['"]/i, message: 'Hardcoded secret', severity: 'critical' as const },
      { pattern: /token\s*=\s*['"][^'"]+['"]/i, message: 'Hardcoded token', severity: 'critical' as const },
      { pattern: /eval\s*\(/, message: 'Use of eval()', severity: 'major' as const },
      { pattern: /innerHTML\s*=/, message: 'Potential XSS via innerHTML', severity: 'major' as const },
      { pattern: /dangerouslySetInnerHTML/, message: 'React dangerouslySetInnerHTML', severity: 'major' as const },
      { pattern: /sql.*\$\{.*\}/i, message: 'Possible SQL injection', severity: 'critical' as const },
      { pattern: /exec\s*\(.*\$\{/, message: 'Possible command injection', severity: 'critical' as const },
      { pattern: /crypto\.createHash\(['"]md5['"]/, message: 'Use of MD5 (cryptographically broken)', severity: 'major' as const },
      { pattern: /crypto\.createHash\(['"]sha1['"]/, message: 'Use of SHA1 (cryptographically weak)', severity: 'minor' as const },
    ];

    for (const file of files) {
      if (!file.match(/\.(ts|tsx|js|jsx|py|go|java|rs)$/)) continue;

      const content = await this.readFile(worktreePath, file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        for (const { pattern, message, severity } of securityPatterns) {
          if (pattern.test(line)) {
            issues.push({
              severity,
              file,
              line: lineNum,
              message: `Security: ${message}`,
              suggestion: this.getSecuritySuggestion(message),
              rule: `security:${message.toLowerCase().replace(/\s+/g, '-')}`,
            });
          }
        }
      }
    }

    return issues;
  }

  private getSecuritySuggestion(message: string): string {
    const suggestions: Record<string, string> = {
      'Hardcoded password': 'Use environment variables or secret manager',
      'Hardcoded API key': 'Use environment variables or secret manager',
      'Hardcoded secret': 'Use environment variables or secret manager',
      'Hardcoded token': 'Use environment variables or secret manager',
      'Use of eval()': 'Avoid eval(); use safe alternatives',
      'Potential XSS via innerHTML': 'Use textContent or sanitize HTML',
      'React dangerouslySetInnerHTML': 'Sanitize content or use safe alternatives',
      'Possible SQL injection': 'Use parameterized queries',
      'Possible command injection': 'Avoid shell commands; use safe APIs',
      'Use of MD5 (cryptographically broken)': 'Use SHA-256 or better',
      'Use of SHA1 (cryptographically weak)': 'Use SHA-256 or better',
    };
    return suggestions[message] || 'Review and remediate';
  }

  private async reviewPerformance(worktreePath: string, files: string[]): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    for (const file of files) {
      if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;

      const content = await this.readFile(worktreePath, file);
      if (!content) continue;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // N+1 query patterns
        if (line.includes('.find(') && line.includes('forEach') || line.includes('.map(')) {
          issues.push({
            severity: 'minor',
            file,
            line: lineNum,
            message: 'Possible N+1 query pattern',
            suggestion: 'Consider batch loading or eager loading',
            rule: 'performance:n-plus-one',
          });
        }

        // Synchronous operations in async context
        if (line.includes('readFileSync') || line.includes('writeFileSync')) {
          issues.push({
            severity: 'minor',
            file,
            line: lineNum,
            message: 'Synchronous file I/O',
            suggestion: 'Use async versions (readFile, writeFile)',
            rule: 'performance:sync-io',
          });
        }
      }
    }

    return issues;
  }

  private async readFile(worktreePath: string, file: string): Promise<string | null> {
    try {
      const { readFile } = await import('fs/promises');
      const { join } = await import('path');
      return await readFile(join(worktreePath, file), 'utf-8');
    } catch {
      return null;
    }
  }
}

export function createCodeReviewer(): CodeReviewer {
  return new CodeReviewer();
}