import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    exclude: ['**/dist/**'],
    coverage: {
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
  },
});
