import { defineConfig } from 'vitest/config';

// The compose smoke test needs a live `docker compose up` stack — excluded
// here so the regular `test` script stays hermetic; run it separately via
// `test:compose` (vitest.compose.config.ts).
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/*.compose.spec.ts'],
  },
});
