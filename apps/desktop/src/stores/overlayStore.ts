import type { OverlayBounds, OverlayState, OverlayView } from '@jarvis-os/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface OverlayStore extends OverlayState {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setBounds: (bounds: Partial<OverlayBounds>) => void;
  setActiveTeam: (teamId: string | undefined) => void;
  setActiveView: (view: OverlayView) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  initialize: () => Promise<void>;
}

const defaultBounds: OverlayBounds = { x: 100, y: 100, width: 1200, height: 800 };

export const useOverlayStore = create<OverlayStore>()(
  persist(
    immer((set, _get) => ({
      isOpen: false,
      bounds: defaultBounds,
      activeTeamId: undefined,
      activeView: 'chat',
      sidebarCollapsed: false,

      setOpen: (open) =>
        set((state) => {
          state.isOpen = open;
        }),
      toggle: () =>
        set((state) => {
          state.isOpen = !state.isOpen;
        }),
      setBounds: (bounds) =>
        set((state) => {
          state.bounds = { ...state.bounds, ...bounds };
        }),
      setActiveTeam: (teamId) =>
        set((state) => {
          state.activeTeamId = teamId;
        }),
      setActiveView: (view) =>
        set((state) => {
          state.activeView = view;
        }),
      setSidebarCollapsed: (collapsed) =>
        set((state) => {
          state.sidebarCollapsed = collapsed;
        }),
      toggleSidebar: () =>
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed;
        }),

      initialize: async () => {
        // Load persisted bounds from Tauri store if available
        try {
          const { Store } = await import('@tauri-apps/plugin-store');
          const store = await Store.load('config.json');
          const savedBounds = await store.get('overlayBounds');
          if (savedBounds) {
            set((state) => {
              state.bounds = { ...defaultBounds, ...savedBounds };
            });
          }
        } catch {
          // Store not available, use defaults
        }
      },
    })),
    {
      name: 'overlay-storage',
      partialize: (state) => ({
        bounds: state.bounds,
        activeTeamId: state.activeTeamId,
        activeView: state.activeView,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
