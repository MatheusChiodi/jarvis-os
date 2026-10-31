import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.{ts,tsx}', '**/*.config.*', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@jarvis-os/core': path.resolve(__dirname, '../../packages/core/src'),
      '@jarvis-os/memory': path.resolve(__dirname, '../../packages/memory/src'),
      '@jarvis-os/runtime': path.resolve(__dirname, '../../packages/runtime/src'),
      '@jarvis-os/skills': path.resolve(__dirname, '../../packages/skills/src'),
      '@jarvis-os/voice': path.resolve(__dirname, '../../packages/voice/src'),
      '@jarvis-os/video': path.resolve(__dirname, '../../packages/video/src'),
      '@jarvis-os/pixel': path.resolve(__dirname, '../../packages/pixel/src'),
      '@jarvis-os/ui-kit': path.resolve(__dirname, '../../packages/ui-kit/src'),
    },
  },
});