import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { generateId, nowISO } from '@jarvis-os/core';

interface AppConfig {
  version: number;
  hotkey: string;
  overlay: {
    defaultBounds: { x: number; y: number; width: number; height: number };
    theme: 'system' | 'light' | 'dark';
    animations: boolean;
  };
  memory: {
    vaultPath: string;
    vectorSearch: boolean;
    embeddingModel: string;
    hooks: { taskCompleted: boolean; teammateIdle: boolean };
  };
  teams: any[];
  skills: {
    enabled: string[];
    customPath: string;
  };
  voice: {
    enabled: boolean;
    wakeWord: string;
    ttsVoice: string;
    sttEngine: string;
  };
  video: {
    enabled: boolean;
    engine: string;
  };
  pixel: {
    enabled: boolean;
    port: number;
  };
}

const defaultConfig: AppConfig = {
  version: 1,
  hotkey: 'Super+Alt+J',
  overlay: {
    defaultBounds: { x: 100, y: 100, width: 1200, height: 800 },
    theme: 'system',
    animations: true,
  },
  memory: {
    vaultPath: '~/.jarvis-os/memory',
    vectorSearch: true,
    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
    hooks: { taskCompleted: true, teammateIdle: true },
  },
  teams: [],
  skills: {
    enabled: ['core', 'superpowers', 'ecc', 'mattpocock'],
    customPath: '~/.jarvis-os/skills/custom',
  },
  voice: {
    enabled: false,
    wakeWord: 'jarvis',
    ttsVoice: 'faber',
    sttEngine: 'web-speech',
  },
  video: {
    enabled: false,
    engine: 'hyperframes',
  },
  pixel: {
    enabled: false,
    port: 3100,
  },
};

interface ConfigStore {
  config: AppConfig;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  resetConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    immer((set, get) => ({
      config: defaultConfig,

      loadConfig: async () => {
        try {
          const { get: getStore } = await import('@tauri-apps/plugin-store');
          const store = await getStore('config.json');
          const saved = (await store.get('config')) as Partial<AppConfig> | null;
          if (saved) {
            set((state) => {
              state.config = { ...defaultConfig, ...saved, version: defaultConfig.version };
            });
          }
        } catch {
          // Use defaults
        }
      },

      saveConfig: async () => {
        try {
          const { get: getStore } = await import('@tauri-apps/plugin-store');
          const store = await getStore('config.json');
          await store.set('config', get().config);
          await store.save();
        } catch (error) {
          console.error('Failed to save config:', error);
        }
      },

      updateConfig: async (patch) => {
        set((state) => {
          state.config = { ...state.config, ...patch };
        });
        await get().saveConfig();
      },

      resetConfig: async () => {
        set((state) => { state.config = defaultConfig; });
        await get().saveConfig();
      },
    })),
    {
      name: 'config-storage',
      partialize: (state) => ({ config: state.config }),
    }
  )
);