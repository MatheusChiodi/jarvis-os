import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry, createProviderRegistry } from './index';
import type { Config } from '@jarvis-os/protocol';

const mockConfig: Config = {
  daemon: { host: '127.0.0.1', port: 47800 },
  providers: [
    { id: 'test-provider', baseUrl: 'http://localhost:8080/v1', apiKeyEnv: 'TEST_API_KEY' },
  ],
  routes: { default: ['test-provider:test-model'] },
  workspaces: ['/home/user'],
  agent: { maxIterations: 25, maxToolOutputChars: 20000, approvalTimeoutMs: 600000 },
};

describe('providers', () => {
  describe('ProviderRegistry', () => {
    it('creates registry with config', () => {
      const registry = new ProviderRegistry(mockConfig);
      expect(registry).toBeInstanceOf(ProviderRegistry);
    });

    it('getProvider returns provider by id', () => {
      const registry = new ProviderRegistry(mockConfig);
      const provider = registry.getProvider('test-provider');
      expect(provider).toBeDefined();
      expect(provider?.id).toBe('test-provider');
      expect(provider?.baseUrl).toBe('http://localhost:8080/v1');
    });

    it('getProvider returns undefined for unknown id', () => {
      const registry = new ProviderRegistry(mockConfig);
      const provider = registry.getProvider('unknown');
      expect(provider).toBeUndefined();
    });

    it('parseModelRef parses valid reference', () => {
      const registry = new ProviderRegistry(mockConfig);
      const ref = registry.parseModelRef('test-provider:gpt-4');
      expect(ref.providerId).toBe('test-provider');
      expect(ref.model).toBe('gpt-4');
    });

    it('parseModelRef throws for invalid format', () => {
      const registry = new ProviderRegistry(mockConfig);
      expect(() => registry.parseModelRef('invalid')).toThrow('Invalid model reference');
    });

    it('resolveModel resolves default route', () => {
      const registry = new ProviderRegistry(mockConfig);
      const models = registry.resolveModel('default');
      expect(models).toHaveLength(1);
      expect(models[0].providerId).toBe('test-provider');
      expect(models[0].model).toBe('test-model');
    });

    it('listProviders returns provider configs', () => {
      const registry = new ProviderRegistry(mockConfig);
      const providers = registry.listProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe('test-provider');
      expect(providers[0].baseUrl).toBe('http://localhost:8080/v1');
    });
  });

  describe('createProviderRegistry', () => {
    it('creates registry instance', () => {
      const registry = createProviderRegistry(mockConfig);
      expect(registry).toBeInstanceOf(ProviderRegistry);
    });
  });
});