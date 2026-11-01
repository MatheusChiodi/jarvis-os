#!/usr/bin/env node
/**
 * check-secrets.mjs — bloqueia commit se encontrar segredos nos arquivos staged
 * Regras (F0-1):
 * - Private keys: -----BEGIN .*PRIVATE KEY-----
 * - OpenAI/Anthropic keys: sk-[A-Za-z0-9_-]{20,}
 * - GitHub PAT (classic): ghp_[A-Za-z0-9]{36}
 * - GitHub PAT (fine-grained): github_pat_[A-Za-z0-9_]{22,}
 * - AWS Access Key ID: AKIA[0-9A-Z]{16}
 * - Slack tokens: xox[baprs]-[A-Za-z0-9-]{10,}
 * - Arquivos .env (exceto *.example)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const patterns = [
  { name: 'private-key', regex: /-----BEGIN .*PRIVATE KEY-----/ },
  { name: 'openai-key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'github-pat-classic', regex: /ghp_[A-Za-z0-9]{36}/ },
  { name: 'github-pat-finegrained', regex: /github_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'aws-access-key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'slack-token', regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
];

const envFileRegex = /\.env($|\.)/;

const skipPaths = [
  'tools/build-scripts/check-secrets.mjs',
  'docs/',
];

function shouldSkip(filePath) {
  return skipPaths.some(p => filePath.includes(p));
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function checkFile(filePath) {
  const absPath = resolve(filePath);
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }

  const violations = [];

  // Check for .env files (except .example)
  if (envFileRegex.test(filePath) && !filePath.endsWith('.example')) {
    violations.push({ rule: 'env-file', line: 1 });
  }

  // Check content patterns
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, regex } of patterns) {
      if (regex.test(line)) {
        violations.push({ rule: name, line: i + 1 });
      }
    }
  }

  return violations;
}

function main() {
  const stagedFiles = getStagedFiles();
  let hasViolations = false;

  for (const file of stagedFiles) {
    if (shouldSkip(file)) continue;
    const violations = checkFile(file);
    for (const { rule, line } of violations) {
      console.error(`check-secrets: possível segredo em ${file}:${line} (${rule})`);
      hasViolations = true;
    }
  }

  if (hasViolations) {
    process.exit(1);
  }
}

main();