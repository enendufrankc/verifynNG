import { defineConfig } from 'vitest/config';

// Runs against a live `docker compose up` stack (real HTTP, no mocks) —
// see docs/epics/E16-public-api-webhooks.md AC5 and T14. Kept out of the
// regular `test` script (which must pass with no stack running) via a
// dedicated include pattern and config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.compose.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
