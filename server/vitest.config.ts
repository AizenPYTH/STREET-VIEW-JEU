import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@cityguess/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
