import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vault } from '../vault/Vault';
import { type HookRegistry, createHookRegistry, registerBuiltInHooks } from './HookRegistry';
import { builtInHooks as hookDefinitions } from './Hooks';
import type { HookContext } from './Hooks';

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: {} as any,
  sqlJs: {} as any,
  initialized: true,
};

const mockContext: HookContext = {
  vault: mockVault,
  projectId: 'test-project',
  agentId: 'agent-1',
  taskId: 'task-1',
};

describe('HookRegistry', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = createHookRegistry();
  });

  describe('Registration', () => {
    it('should register a hook', () => {
      const hook = {
        name: 'testHook',
        execute: vi.fn().mockResolvedValue(undefined),
      };

      registry.register(hook);
      expect(registry.has('testHook')).toBe(true);
      expect(registry.getNames()).toContain('testHook');
    });

    it('should throw when registering duplicate hook', () => {
      const hook = {
        name: 'testHook',
        execute: vi.fn().mockResolvedValue(undefined),
      };

      registry.register(hook);
      expect(() => registry.register(hook)).toThrow('already registered');
    });

    it('should unregister a hook', () => {
      const hook = {
        name: 'testHook',
        execute: vi.fn().mockResolvedValue(undefined),
      };

      registry.register(hook);
      expect(registry.unregister('testHook')).toBe(true);
      expect(registry.has('testHook')).toBe(false);
      expect(registry.unregister('testHook')).toBe(false);
    });

    it('should get a hook', () => {
      const hook = {
        name: 'testHook',
        execute: vi.fn().mockResolvedValue(undefined),
      };

      registry.register(hook);
      const retrieved = registry.get('testHook');
      expect(retrieved).toBe(hook);
    });

    it('should return undefined for non-existent hook', () => {
      expect(registry.get('nonExistent')).toBeUndefined();
    });
  });

  describe('Execution', () => {
    it('should execute a hook', async () => {
      const executeFn = vi.fn().mockResolvedValue(undefined);
      const hook = { name: 'testHook', execute: executeFn };

      registry.register(hook);
      await registry.execute('testHook', mockContext);

      expect(executeFn).toHaveBeenCalledWith(mockContext);
    });

    it('should warn for non-existent hook', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await registry.execute('nonExistent', mockContext);

      expect(consoleWarn).toHaveBeenCalledWith("Hook 'nonExistent' not found");
      consoleWarn.mockRestore();
    });

    it('should propagate errors from hooks', async () => {
      const error = new Error('Hook failed');
      const hook = { name: 'failingHook', execute: vi.fn().mockRejectedValue(error) };

      registry.register(hook);

      await expect(registry.execute('failingHook', mockContext)).rejects.toThrow('Hook failed');
    });

    it('should execute all hooks', async () => {
      const executeFn1 = vi.fn().mockResolvedValue(undefined);
      const executeFn2 = vi.fn().mockResolvedValue(undefined);

      registry.register({ name: 'hook1', execute: executeFn1 });
      registry.register({ name: 'hook2', execute: executeFn2 });

      await registry.executeAll(mockContext);

      expect(executeFn1).toHaveBeenCalledWith(mockContext);
      expect(executeFn2).toHaveBeenCalledWith(mockContext);
    });

    it('should continue executing other hooks if one fails', async () => {
      const executeFn1 = vi.fn().mockRejectedValue(new Error('Hook 1 failed'));
      const executeFn2 = vi.fn().mockResolvedValue(undefined);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      registry.register({ name: 'hook1', execute: executeFn1 });
      registry.register({ name: 'hook2', execute: executeFn2 });

      await registry.executeAll(mockContext);

      expect(executeFn1).toHaveBeenCalled();
      expect(executeFn2).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Utility Methods', () => {
    it('should get all hooks', () => {
      registry.register({ name: 'hook1', execute: vi.fn() });
      registry.register({ name: 'hook2', execute: vi.fn() });

      const hooks = registry.getAll();
      expect(hooks.length).toBe(2);
    });

    it('should get hook names', () => {
      registry.register({ name: 'hook1', execute: vi.fn() });
      registry.register({ name: 'hook2', execute: vi.fn() });

      const names = registry.getNames();
      expect(names).toEqual(['hook1', 'hook2']);
    });

    it('should clear all hooks', () => {
      registry.register({ name: 'hook1', execute: vi.fn() });
      registry.register({ name: 'hook2', execute: vi.fn() });

      registry.clear();

      expect(registry.getNames()).toEqual([]);
    });
  });

  describe('Configuration', () => {
    it('should have default config', () => {
      const config = registry.getConfig();
      expect(config.taskCompleted).toBeDefined();
      expect(config.teammateIdle).toBeDefined();
      expect(config.taskCompleted!.enabled).toBe(true);
      expect(config.teammateIdle!.enabled).toBe(true);
    });

    it('should update config', () => {
      registry.updateConfig({
        taskCompleted: { enabled: false },
      });

      const config = registry.getConfig();
      expect(config.taskCompleted!.enabled).toBe(false);
      expect(config.teammateIdle!.enabled).toBe(true);
    });
  });
});

describe('registerBuiltInHooks', () => {
  it('should register all built-in hooks', async () => {
    const registry = createHookRegistry();
    await registerBuiltInHooks(registry);

    const names = registry.getNames();
    expect(names).toContain('taskCompleted');
    expect(names).toContain('teammateIdle');
  });
});

describe('builtInHooks from Hooks.ts', () => {
  it('should have correct hook definitions', () => {
    expect(hookDefinitions.length).toBe(5);

    const taskCompleted = hookDefinitions.find((h) => h.name === 'taskCompleted');
    expect(taskCompleted).toBeDefined();
    expect(taskCompleted!.description).toContain('learning note');

    const teammateIdle = hookDefinitions.find((h) => h.name === 'teammateIdle');
    expect(teammateIdle).toBeDefined();
    expect(teammateIdle!.description).toContain('state note');

    const taskStarted = hookDefinitions.find((h) => h.name === 'taskStarted');
    expect(taskStarted).toBeDefined();
    expect(taskStarted!.description).toContain('state note');

    const decisionMade = hookDefinitions.find((h) => h.name === 'decisionMade');
    expect(decisionMade).toBeDefined();
    expect(decisionMade!.description).toContain('decision note');

    const communicationSent = hookDefinitions.find((h) => h.name === 'communicationSent');
    expect(communicationSent).toBeDefined();
    expect(communicationSent!.description).toContain('communication note');
  });
});
