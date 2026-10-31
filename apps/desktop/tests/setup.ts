import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  get: vi.fn(() => Promise.resolve({
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(),
    save: vi.fn(),
  })),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    hide: vi.fn(),
    show: vi.fn(),
    setFocus: vi.fn(),
    isVisible: vi.fn(() => Promise.resolve(false)),
    onWindowEvent: vi.fn(),
  })),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  },
});