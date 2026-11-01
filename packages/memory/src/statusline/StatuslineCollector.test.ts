import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressiveDisclosure } from '../search/ProgressiveDisclosure';
import type { Vault } from '../vault/Vault';
import { StatuslineCollector, createStatuslineCollector } from './StatuslineCollector';

const mockVault: Vault = {
  projectId: 'test-project',
  path: '/tmp/test-project',
  db: {} as any,
  sqlJs: {} as any,
  initialized: true,
};

const mockProgressiveDisclosure: ProgressiveDisclosure = {
  vault: mockVault,
  getStats: vi.fn(),
} as any;

vi.mock('../vault/Vault', () => ({
  getHookState: vi.fn(),
  setHookState: vi.fn(),
}));

import { getHookState, setHookState } from '../vault/Vault';

describe('StatuslineCollector', () => {
  let collector: StatuslineCollector;

  beforeEach(() => {
    vi.clearAllMocks();
    collector = createStatuslineCollector({
      projectId: 'test-project',
      vault: mockVault,
      progressiveDisclosure: mockProgressiveDisclosure,
      model: 'test-model',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create collector', () => {
    expect(collector).toBeInstanceOf(StatuslineCollector);
  });

  it('should collect statusline data', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 5,
      notesByType: { memory: 3, decision: 2 },
      notesByAgent: { 'agent-1': 5 },
      totalEmbeddings: 5,
    });

    getHookState
      .mockResolvedValueOnce({ state: JSON.stringify({ fiveHour: 10, sevenDay: 50 }) })
      .mockResolvedValueOnce({ state: JSON.stringify({ usage: 0.75 }) })
      .mockResolvedValueOnce({ state: JSON.stringify({ total: 0.05 }) });

    const data = await collector.collect();

    expect(data).toEqual({
      planUsage: { fiveHour: 10, sevenDay: 50 },
      contextWindow: 0.75,
      cost: 0.05,
      model: 'test-model',
      memory: { project: 'test-project', enabled: true, noteCount: 5 },
    });
  });

  it('should use defaults when hook state not found', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 0,
      notesByType: {},
      notesByAgent: {},
      totalEmbeddings: 0,
    });

    getHookState.mockResolvedValue(null);

    const data = await collector.collect();

    expect(data.planUsage).toEqual({ fiveHour: 0, sevenDay: 0 });
    expect(data.contextWindow).toBe(0);
    expect(data.cost).toBe(0);
  });

  it('should cache results', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 5,
      notesByType: {},
      notesByAgent: {},
      totalEmbeddings: 0,
    });

    getHookState.mockResolvedValue(null);

    await collector.collect();
    await collector.collect();

    expect(mockProgressiveDisclosure.getStats).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 5,
      notesByType: {},
      notesByAgent: {},
      totalEmbeddings: 0,
    });

    getHookState.mockResolvedValue(null);

    await collector.collect();
    collector.invalidateCache();
    await collector.collect();

    expect(mockProgressiveDisclosure.getStats).toHaveBeenCalledTimes(2);
  });

  it('should update plan usage', async () => {
    setHookState.mockResolvedValue(undefined);

    await collector.updatePlanUsage(15, 60);

    expect(setHookState).toHaveBeenCalledWith(mockVault, 'planUsage', 'system', {
      fiveHour: 15,
      sevenDay: 60,
    });
  });

  it('should update context window usage', async () => {
    setHookState.mockResolvedValue(undefined);

    await collector.updateContextWindowUsage(0.8);

    expect(setHookState).toHaveBeenCalledWith(mockVault, 'contextWindow', 'system', { usage: 0.8 });
  });

  it('should update cost', async () => {
    setHookState.mockResolvedValue(undefined);

    await collector.updateCost(0.1);

    expect(setHookState).toHaveBeenCalledWith(mockVault, 'cost', 'system', { total: 0.1 });
  });

  it('should update model', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 5,
      notesByType: {},
      notesByAgent: {},
      totalEmbeddings: 0,
    });
    getHookState.mockResolvedValue(null);

    await collector.updateModel('new-model');

    const data = await collector.collect();
    expect(data.model).toBe('new-model');
  });

  it('should return cached data', async () => {
    mockProgressiveDisclosure.getStats = vi.fn().mockResolvedValue({
      totalNotes: 5,
      notesByType: {},
      notesByAgent: {},
      totalEmbeddings: 0,
    });

    getHookState.mockResolvedValue(null);

    await collector.collect();
    const cached = collector.getCached();

    expect(cached).not.toBeNull();
    expect(cached!.memory.noteCount).toBe(5);
  });

  it('should return null cache initially', () => {
    expect(collector.getCached()).toBeNull();
  });
});
