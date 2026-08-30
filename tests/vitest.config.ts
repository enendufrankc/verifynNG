import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    root: __dirname,
    include: [
      'isolation/**/*.test.ts',
      'chaos/**/*.test.ts',
      'contracts/**/*.test.ts',
    ],
    exclude: ['**/dist/**'],
  },
});
