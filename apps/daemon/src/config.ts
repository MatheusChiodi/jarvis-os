import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, validateConfig } from '@jarvis-os/protocol';

const CONFIG_DIR = resolve(homedir(), '.jarvis-os');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');
const TOKEN_PATH = resolve(CONFIG_DIR, 'daemon.token');

export const config = loadConfig();

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    const defaultConfig: Config = {
      daemon: { host: '127.0.0.1', port: 47800 },
      providers: [
        { id: '9router', baseUrl: 'http://localhost:20128/v1', apiKeyEnv: 'NINEROUTER_API_KEY' },
        { id: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'OLLAMA_API_KEY' },
      ],
      routes: {
        default: ['9router:gpt-4o-mini', 'ollama:qwen2.5-coder:7b'],
      },
      workspaces: [resolve(homedir(), 'VibeCode')],
      agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
    };
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return validateConfig(parsed);
  } catch (error) {
    console.error('Failed to load config, using defaults:', error);
    return {
      daemon: { host: '127.0.0.1', port: 47800 },
      providers: [
        { id: '9router', baseUrl: 'http://localhost:20128/v1', apiKeyEnv: 'NINEROUTER_API_KEY' },
        { id: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKeyEnv: 'OLLAMA_API_KEY' },
      ],
      routes: { default: ['9router:gpt-4o-mini', 'ollama:qwen2.5-coder:7b'] },
      workspaces: [resolve(homedir(), 'VibeCode')],
      agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
    };
  }
}

export function saveConfig(config: any): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getOrCreateToken(): string {
  if (existsSync(TOKEN_PATH)) {
    return readFileSync(TOKEN_PATH, 'utf-8').trim();
  }

  const token = crypto.randomBytes(32).toString('hex');
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(TOKEN_PATH, token);
  return token;
}

export function validateToken(token: string): boolean {
  const validToken = getOrCreateToken();
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(validToken));
}
