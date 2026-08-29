import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/config/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'apps/api/vitest.config.ts',
  'tests/vitest.config.ts',
]);
