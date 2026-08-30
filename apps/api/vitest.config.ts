import { defineConfig } from 'vitest/config';

export default defineConfig({
  // apps/api/tsconfig.json scopes `include` to "src" (so `nest build` never
  // emits test files), which means Vite's automatic tsconfig-based transform
  // options don't apply to files under test/ — decorators (@Public(), etc.)
  // used directly in spec files would silently fail to parse. Force legacy
  // decorator support on explicitly via oxc (Vite 8's default transformer,
  // which does not read tsconfig `experimentalDecorators` for files outside
  // a project's `include`).
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    fileParallelism: false,
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'test/**/*.spec.ts'],
    exclude: ['**/dist/**'],
  },
});
