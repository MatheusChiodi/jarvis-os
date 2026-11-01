import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    globals: true,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    deps: {
      inline: ['@jarvis-os/*'],
      optimizer: {
        ssr: {
          include: ['@jarvis-os/*'],
        },
      },
    },
    resolve: {
      conditions: ['development', 'import', 'module', 'default'],
      mainFields: ['source', 'module', 'main'],
      alias: {
        '@jarvis-os/core': path.resolve(__dirname, 'packages/core/src'),
        '@jarvis-os/core/types': path.resolve(__dirname, 'packages/core/src/types'),
        '@jarvis-os/core/utils': path.resolve(__dirname, 'packages/core/src/utils'),
        '@jarvis-os/memory': path.resolve(__dirname, 'packages/memory/src'),
        '@jarvis-os/runtime': path.resolve(__dirname, 'packages/runtime/src'),
        '@jarvis-os/skills': path.resolve(__dirname, 'packages/skills/src'),
        '@jarvis-os/pixel': path.resolve(__dirname, 'packages/pixel/src'),
        '@jarvis-os/ui-kit': path.resolve(__dirname, 'packages/ui-kit/src'),
      },
    },
    server: {
      deps: {
        external: [],
      },
    },
  },
});
