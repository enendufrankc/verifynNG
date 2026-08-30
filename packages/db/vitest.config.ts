import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    // createTestDatabase() shells out to `prisma migrate deploy` (a fresh
    // Node + Prisma engine boot running every migration) inside beforeAll —
    // vitest's 10s default hookTimeout is tight for that even in isolation,
    // and trips under concurrent load (many worktrees' test/docker runs on
    // the same machine) well before anything is actually wrong.
    hookTimeout: 30_000,
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
