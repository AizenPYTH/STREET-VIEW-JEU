import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverUrl = process.env.VITE_DEV_SERVER_PROXY ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cityguess/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': serverUrl,
      '/socket.io': { target: serverUrl, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
