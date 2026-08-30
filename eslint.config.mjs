import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      'legacy/**',
      // Service worker script — runs in its own global scope (self,
      // caches, fetch as globals), not the app's TS/React lint surface.
      'apps/web-verify/public/**',
      // Node CommonJS config file (lhci reads it directly, not via the
      // TS/bundler pipeline) — process/require/module are real globals here.
      'apps/web-verify/lighthouserc.js',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
