import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    deps: {
      inline: ['@jarvis-os/core'],
    },
    resolve: {
      conditions: ['import', 'module', 'default'],
      alias: {
        '@jarvis-os/core': path.resolve(__dirname, '../core/src'),
        '@jarvis-os/core/types': path.resolve(__dirname, '../core/src/types'),
        '@jarvis-os/core/utils': path.resolve(__dirname, '../core/src/utils'),
        '@jarvis-os/memory': path.resolve(__dirname, './src'),
      },
    },
  },
});
