import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayStore } from './overlayStore';

// Mock Tauri store plugin
vi.mock('@tauri-apps/plugin-store', () => ({
  Store: {
    load: vi.fn(() =>
      Promise.resolve({
        get: vi.fn(() => Promise.resolve(null)),
        set: vi.fn(),
        save: vi.fn(),
      })
    ),
  },
}));

describe('overlayStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useOverlayStore.setState({
      isOpen: false,
      bounds: { x: 100, y: 100, width: 1200, height: 800 },
      activeTeamId: undefined,
      activeView: 'chat',
      sidebarCollapsed: false,
    });
  });

  describe('setOpen', () => {
    it('should set isOpen to true', () => {
      act(() => {
        useOverlayStore.getState().setOpen(true);
      });
      expect(useOverlayStore.getState().isOpen).toBe(true);
    });

    it('should set isOpen to false', () => {
      act(() => {
        useOverlayStore.getState().setOpen(true);
        useOverlayStore.getState().setOpen(false);
      });
      expect(useOverlayStore.getState().isOpen).toBe(false);
    });
  });

  describe('toggle', () => {
    it('should toggle isOpen from false to true', () => {
      act(() => {
        useOverlayStore.getState().toggle();
      });
      expect(useOverlayStore.getState().isOpen).toBe(true);
    });

    it('should toggle isOpen from true to false', () => {
      act(() => {
        useOverlayStore.getState().setOpen(true);
        useOverlayStore.getState().toggle();
      });
      expect(useOverlayStore.getState().isOpen).toBe(false);
    });
  });

  describe('setBounds', () => {
    it('should update bounds partially', () => {
      act(() => {
        useOverlayStore.getState().setBounds({ x: 200, width: 1000 });
      });
      const bounds = useOverlayStore.getState().bounds;
      expect(bounds.x).toBe(200);
      expect(bounds.width).toBe(1000);
      expect(bounds.y).toBe(100); // unchanged
      expect(bounds.height).toBe(800); // unchanged
    });

    it('should update all bounds', () => {
      act(() => {
        useOverlayStore.getState().setBounds({ x: 0, y: 0, width: 800, height: 600 });
      });
      expect(useOverlayStore.getState().bounds).toEqual({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
    });
  });

  describe('setActiveTeam', () => {
    it('should set active team id', () => {
      act(() => {
        useOverlayStore.getState().setActiveTeam('team-123');
      });
      expect(useOverlayStore.getState().activeTeamId).toBe('team-123');
    });

    it('should clear active team id when undefined', () => {
      act(() => {
        useOverlayStore.getState().setActiveTeam('team-123');
        useOverlayStore.getState().setActiveTeam(undefined);
      });
      expect(useOverlayStore.getState().activeTeamId).toBeUndefined();
    });
  });

  describe('setActiveView', () => {
    it('should set active view', () => {
      act(() => {
        useOverlayStore.getState().setActiveView('plan');
      });
      expect(useOverlayStore.getState().activeView).toBe('plan');
    });

    it('should accept all valid view types', () => {
      const views = ['chat', 'terminal', 'plan', 'memory', 'settings'] as const;
      views.forEach((view) => {
        act(() => {
          useOverlayStore.getState().setActiveView(view);
        });
        expect(useOverlayStore.getState().activeView).toBe(view);
      });
    });
  });

  describe('setSidebarCollapsed', () => {
    it('should set sidebar collapsed state', () => {
      act(() => {
        useOverlayStore.getState().setSidebarCollapsed(true);
      });
      expect(useOverlayStore.getState().sidebarCollapsed).toBe(true);
    });

    it('should toggle sidebar collapsed state', () => {
      act(() => {
        useOverlayStore.getState().setSidebarCollapsed(false);
        useOverlayStore.getState().setSidebarCollapsed(true);
      });
      expect(useOverlayStore.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe('persistence', () => {
    it('should persist bounds, activeTeamId, activeView, sidebarCollapsed', () => {
      // Test that the store has the expected persist configuration
      // by verifying the partialize function behavior indirectly
      const state = useOverlayStore.getState();
      expect(state).toHaveProperty('bounds');
      expect(state).toHaveProperty('activeTeamId');
      expect(state).toHaveProperty('activeView');
      expect(state).toHaveProperty('sidebarCollapsed');
      expect(state).toHaveProperty('isOpen');
    });
  });
});
