import type { HookContext, TaskCompletedHookConfig, TeammateIdleHookConfig } from './Hooks.js';

export interface Hook {
  name: string;
  execute: (context: HookContext) => Promise<void>;
  config?: Record<string, unknown>;
}

export interface HookRegistryConfig {
  taskCompleted?: Partial<TaskCompletedHookConfig>;
  teammateIdle?: Partial<TeammateIdleHookConfig>;
}

export class HookRegistry {
  private hooks: Map<string, Hook> = new Map();
  private config: HookRegistryConfig;

  constructor(config: HookRegistryConfig = {}) {
    this.config = {
      taskCompleted: {
        enabled: true,
        requiredNoteTypes: ['learning', 'decision'],
        ...config.taskCompleted,
      },
      teammateIdle: {
        enabled: true,
        idleThresholdMinutes: 10,
        requiredNoteTypes: ['state'],
        ...config.teammateIdle,
      },
    };
  }

  register(hook: Hook): void {
    if (this.hooks.has(hook.name)) {
      throw new Error(`Hook '${hook.name}' already registered`);
    }
    this.hooks.set(hook.name, hook);
  }

  unregister(name: string): boolean {
    return this.hooks.delete(name);
  }

  get(name: string): Hook | undefined {
    return this.hooks.get(name);
  }

  getAll(): Hook[] {
    return Array.from(this.hooks.values());
  }

  getNames(): string[] {
    return Array.from(this.hooks.keys());
  }

  async execute(name: string, context: HookContext): Promise<void> {
    const hook = this.hooks.get(name);
    if (!hook) {
      console.warn(`Hook '${name}' not found`);
      return;
    }

    try {
      await hook.execute(context);
    } catch (error) {
      console.error(`Hook '${name}' execution failed:`, error);
      throw error;
    }
  }

  async executeAll(context: HookContext): Promise<void> {
    for (const hook of this.hooks.values()) {
      try {
        await hook.execute(context);
      } catch (error) {
        console.error(`Hook '${hook.name}' execution failed:`, error);
      }
    }
  }

  has(name: string): boolean {
    return this.hooks.has(name);
  }

  clear(): void {
    this.hooks.clear();
  }

  getConfig(): HookRegistryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<HookRegistryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createHookRegistry(config?: HookRegistryConfig): HookRegistry {
  return new HookRegistry(config);
}

export const builtInHooks: Hook[] = [
  {
    name: 'taskCompleted',
    execute: async (context: HookContext) => {
      const { onTaskCompleted } = await import('./Hooks.js');
      await onTaskCompleted(context);
    },
  },
  {
    name: 'teammateIdle',
    execute: async (context: HookContext) => {
      const { onTeammateIdle } = await import('./Hooks.js');
      await onTeammateIdle(context);
    },
  },
];

export async function registerBuiltInHooks(registry: HookRegistry): Promise<void> {
  for (const hook of builtInHooks) {
    registry.register(hook);
  }
}
