import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
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
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: ['@tauri-apps/api'],
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});