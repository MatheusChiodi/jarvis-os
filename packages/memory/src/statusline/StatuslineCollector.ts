import type { StatuslineData } from '@jarvis-os/core';
import type { ProgressiveDisclosure } from '../search/ProgressiveDisclosure.js';
import type { Vault } from '../vault/Vault.js';

export interface StatuslineCollectorConfig {
  projectId: string;
  vault: Vault;
  progressiveDisclosure?: ProgressiveDisclosure;
  model?: string;
}

export class StatuslineCollector {
  private projectId: string;
  private vault: Vault;
  private progressiveDisclosure?: ProgressiveDisclosure;
  private model: string;
  private cache: StatuslineData | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 5000;

  constructor(config: StatuslineCollectorConfig) {
    this.projectId = config.projectId;
    this.vault = config.vault;
    this.progressiveDisclosure = config.progressiveDisclosure;
    this.model = config.model || 'unknown';
  }

  async collect(): Promise<StatuslineData> {
    const now = Date.now();
    if (this.cache && now < this.cacheExpiry) {
      return this.cache;
    }

    const [noteCount, planUsage] = await Promise.all([this.getNoteCount(), this.getPlanUsage()]);

    const contextWindow = await this.getContextWindowUsage();
    const cost = await this.getCostEstimate();

    this.cache = {
      planUsage,
      contextWindow,
      cost,
      model: this.model,
      memory: {
        project: this.projectId,
        enabled: true,
        noteCount,
      },
    };

    this.cacheExpiry = now + this.CACHE_TTL;
    return this.cache;
  }

  private async getNoteCount(): Promise<number> {
    try {
      const stats = await this.progressiveDisclosure?.getStats();
      return stats?.totalNotes || 0;
    } catch {
      return 0;
    }
  }

  private async getPlanUsage(): Promise<{ fiveHour: number; sevenDay: number }> {
    try {
      const { getHookState } = await import('../vault/Vault.js');
      const state = await getHookState(this.vault, 'planUsage', 'system');

      if (state) {
        const data = JSON.parse(state.state) as { fiveHour?: number; sevenDay?: number };
        return {
          fiveHour: data.fiveHour || 0,
          sevenDay: data.sevenDay || 0,
        };
      }
    } catch {
      // Ignore errors
    }
    return { fiveHour: 0, sevenDay: 0 };
  }

  private async getContextWindowUsage(): Promise<number> {
    try {
      const { getHookState } = await import('../vault/Vault.js');
      const state = await getHookState(this.vault, 'contextWindow', 'system');

      if (state) {
        const data = JSON.parse(state.state) as { usage?: number };
        return data.usage || 0;
      }
    } catch {
      // Ignore errors
    }
    return 0;
  }

  private async getCostEstimate(): Promise<number> {
    try {
      const { getHookState } = await import('../vault/Vault.js');
      const state = await getHookState(this.vault, 'cost', 'system');

      if (state) {
        const data = JSON.parse(state.state) as { total?: number };
        return data.total || 0;
      }
    } catch {
      // Ignore errors
    }
    return 0;
  }

  async updatePlanUsage(fiveHour: number, sevenDay: number): Promise<void> {
    const { setHookState } = await import('../vault/Vault.js');
    await setHookState(this.vault, 'planUsage', 'system', { fiveHour, sevenDay });
    this.invalidateCache();
  }

  async updateContextWindowUsage(usage: number): Promise<void> {
    const { setHookState } = await import('../vault/Vault.js');
    await setHookState(this.vault, 'contextWindow', 'system', { usage });
    this.invalidateCache();
  }

  async updateCost(cost: number): Promise<void> {
    const { setHookState } = await import('../vault/Vault.js');
    await setHookState(this.vault, 'cost', 'system', { total: cost });
    this.invalidateCache();
  }

  async updateModel(model: string): Promise<void> {
    this.model = model;
    this.invalidateCache();
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpiry = 0;
  }

  getCached(): StatuslineData | null {
    return this.cache;
  }
}

export function createStatuslineCollector(config: StatuslineCollectorConfig): StatuslineCollector {
  return new StatuslineCollector(config);
}
