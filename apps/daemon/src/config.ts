import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { type Config, validateConfig } from '@jarvis-os/protocol';

const CONFIG_DIR = resolve(homedir(), '.jarvis-os');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.json');
const TOKEN_PATH = resolve(CONFIG_DIR, 'daemon.token');

const DEFAULT_CONFIG: Config = {
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

let cachedToken: string | null = null;

export const config = loadConfig();

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return validateConfig(parsed);
  } catch (error) {
    throw new Error(`Failed to load config from ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}. Fix or delete the config file.`);
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getOrCreateToken(): string {
  if (cachedToken) return cachedToken;
  if (existsSync(TOKEN_PATH)) {
    cachedToken = readFileSync(TOKEN_PATH, 'utf-8').trim();
    return cachedToken;
  }

  const token = crypto.randomBytes(32).toString('hex');
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
  cachedToken = token;
  return token;
}

export function validateToken(token: string): boolean {
  const validToken = getOrCreateToken();
  const tokenHash = crypto.createHash('sha256').update(token).digest();
  const validTokenHash = crypto.createHash('sha256').update(validToken).digest();
  return crypto.timingSafeEqual(tokenHash, validTokenHash);
}
