import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    root: __dirname,
    setupFiles: ['./setup-env.ts'],
    include: [
      'isolation/**/*.test.ts',
      'chaos/**/*.test.ts',
      'contracts/**/*.test.ts',
    ],
    exclude: ['**/dist/**'],
  },
});
