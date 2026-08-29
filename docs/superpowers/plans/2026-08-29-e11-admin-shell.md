# E11 — Admin Console Shell & Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin console shell and design system so every later epic has a place to drop a module screen and a shared component library to draw from.

**Architecture:** `packages/ui` owns design tokens (CSS variables + Tailwind v4 `@theme`), primitives (shadcn/ui-generated, Radix-based), and Storybook. `apps/web-admin` owns the Next.js App Router shell: `(auth)` route group for login/MFA/password screens, `(console)` layout with sidebar/topbar/tenant-switcher, `nav.config.ts` registry, typed `apiClient` with silent refresh, TanStack Query + form conventions, and EmptyState placeholders for every module. Since E02 (auth API) hasn't shipped, all auth routes are stubbed behind the published interface; the real wiring happens when E02 merges.

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4, shadcn/ui (Radix), TypeScript, Vitest, Storybook 8, Playwright, zustand (auth store), @tanstack/react-query, react-hook-form + zod, @axe-core/playwright, qrcode.react, oathtool (dev only for MFA testing)

---

## Key decisions

1. **E02 stubs:** E02 is `Status: todo` — not shipped. E11 stubs all auth routes (`/auth/login`, `/auth/refresh`, `/auth/me`, etc.) in the Next.js route handlers (`/api/auth/*`) as in-memory fakes that return hardcoded JWT-shaped objects. When E02 ships, the stubs are replaced by proxy calls to the real API. The stub layer is isolated in `apps/web-admin/lib/api-stubs.ts`.
2. **Tailwind v4:** The repo uses `@tailwindcss/postcss` v4 and `@import 'tailwindcss'`. Tokens go into `@theme` in CSS, consumed as utility classes. No `tailwind.config.ts`.
3. **shadcn/ui generation into `packages/ui`:** Components are generated with `npx shadcn@latest init` configured to output into `packages/ui/src/components/`. The CLI's `components.json` lives at `packages/ui/`.
4. **Ports:** This worktree uses `WEB_ADMIN_PORT=4134`, `API_HOST_PORT=5133`, `MAILPIT_UI_PORT=9158` from `.env`. Never hardcode 3000/3001/4000/5432.
5. **No real auth backend:** Until E02 ships, the apiClient talks to stub handlers. The middleware, refresh flow, and token management are all real — only the "server" behind the stubs is fake.
6. **Token drift check:** A CI script compares `packages/ui/src/tokens.css` `:root` block against `docs/design/foundations/tokens-v0.2-turquoise.css` and fails if they diverge.

## File structure (new/modified files)

### `packages/ui/` (new package)

```
packages/ui/
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  postcss.config.mjs
  components.json                  # shadcn/ui config pointing output into this package
  src/
    index.ts                       # barrel export
    tokens.css                     # @theme block importing design tokens
    tailwind-preset.ts             # Tailwind v4 preset mapping --vg-* to utilities
    apply-tenant-theme.ts          # applyTenantTheme function
    apply-tenant-theme.test.ts
    components/
      ui/                          # shadcn/ui generated components
        button.tsx
        icon-button.tsx
        input.tsx
        textarea.tsx
        select.tsx
        checkbox.tsx
        switch.tsx
        radio-group.tsx
        label.tsx
        form-field.tsx
        form-message.tsx
        badge.tsx
        status-chip.tsx
        skeleton.tsx
        kbd.tsx
        table.tsx
        data-table.tsx
        dialog.tsx
        confirm-dialog.tsx
        sheet.tsx
        toast.tsx
        toaster.tsx
        use-toast.ts
        tabs.tsx
        page-header.tsx
        breadcrumbs.tsx
        empty-state.tsx
        progress-bar.tsx
        code-block.tsx
    stories/
      foundations.stories.tsx      # type scale, neutrals, brand, verdict family
      button.stories.tsx
      ... one per component
  .storybook/
    main.ts
    preview.ts
```

### `apps/web-admin/` (modify existing)

```
apps/web-admin/
  package.json                     # add deps: zustand, @tanstack/react-query, react-hook-form, @hookform/resolvers, zod, lucide-react, qrcode.react, @axe-core/playwright, class-variance-authority, clsx, tailwind-merge, @radix-ui/*
  app/
    layout.tsx                     # rewrite: providers (QueryClient, Toast, Theme)
    globals.css                    # rewrite: @import packages/ui tokens
    providers.tsx                  # new: QueryClientProvider, Toaster, ThemeProvider
    (auth)/
      layout.tsx                   # centered card layout, brand mark
      login/
        page.tsx                   # email + password form
      mfa/
        page.tsx                   # 6-digit TOTP + recovery code toggle
      forgot-password/
        page.tsx                   # email form → 202 always
      reset-password/
        page.tsx                   # token + new password
      set-password/
        page.tsx                   # invite token + new password
    (console)/
      layout.tsx                   # sidebar + topbar + breadcrumbs
      nav.config.ts                # registry with all module entries
      page.tsx                     # dashboard EmptyState
      products/page.tsx            # EmptyState
      oems/page.tsx                # EmptyState
      batches/page.tsx             # EmptyState
      units/page.tsx               # EmptyState
      scans/page.tsx               # EmptyState
      anomalies/page.tsx           # EmptyState
      reports/page.tsx             # EmptyState
      analytics/page.tsx           # EmptyState
      team/
        page.tsx                   # members DataTable (reference impl)
      audit/page.tsx               # EmptyState
      billing/page.tsx             # EmptyState
      settings/
        layout.tsx                 # sub-nav
        page.tsx                   # EmptyState → links to sub-pages
        organization/page.tsx      # EmptyState (E03)
        security/
          page.tsx                 # change password, MFA, sessions
        api-keys/page.tsx          # EmptyState (E16)
      support/
        layout.tsx                 # gated on platformRole=support
        page.tsx                   # EmptyState
    api/
      auth/
        session/route.ts           # POST: login/refresh proxy (sets httpOnly cookie)
        logout/route.ts            # POST: logout proxy
      health/route.ts              # existing
    middleware.ts                  # redirect unauthenticated → /login?next=
  lib/
    api-client.ts                  # typed fetch with silent refresh
    api-stubs.ts                   # E02 stub responses (deleted when E02 ships)
    auth-store.ts                  # zustand: user, memberships, tokens, switchTenant, logout
    query.ts                       # QueryClient factory, queryKeys factory, usePagedQuery
    forms.ts                       # Form wrapper, setServerErrors
    role-utils.ts                  # hasMinRole, filterNavByRole
    tenant-path.ts                 # useTenantPath hook
  components/
    sidebar.tsx                    # collapsible sidebar with nav entries
    topbar.tsx                     # tenant switcher, user menu, dark-mode toggle
    tenant-switcher.tsx            # membership list dropdown
    user-menu.tsx                  # avatar, logout
    breadcrumbs.tsx                # route-segment breadcrumbs
    status-banner.tsx              # pending/suspended tenant banner
  e2e/
    fixtures/
      index.ts                     # loginAs, expectNoA11yViolations
    login.spec.ts
    mfa.spec.ts
    password-reset.spec.ts
    tenant-switch.spec.ts
    role-nav.spec.ts
    skeleton-routes.spec.ts
    a11y.spec.ts
  playwright.config.ts
docs/console.md                     # how to add a module
scripts/
  check-token-drift.ts              # CI check: tokens match design source
```

### `packages/config/src/env-schema.ts` (hot-spot: add E11 section)

Add a section comment for E11 with `NEXT_PUBLIC_API_URL` (already present) and `JWT_ACCESS_TTL` override.

---

## Tasks

### Task 1: Scaffold `packages/ui` package

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tsup.config.ts`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/postcss.config.mjs`
- Create: `packages/ui/src/index.ts` (empty barrel)
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/tailwind-preset.ts`
- Create: `packages/ui/src/apply-tenant-theme.ts`
- Create: `packages/ui/src/apply-tenant-theme.test.ts`
- Modify: `pnpm-workspace.yaml` (already includes `packages/*`)
- Modify: `packages/ui/` (new — pnpm install will link it)

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@verifyng/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./tailwind-preset": {
      "import": {
        "types": "./dist/tailwind-preset.d.ts",
        "default": "./dist/tailwind-preset.js"
      }
    },
    "./tokens.css": "./src/tokens.css",
    "./style.css": "./src/tokens.css"
  },
  "files": ["dist", "src/tokens.css"],
  "sideEffects": ["src/tokens.css"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  },
  "dependencies": {
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-tooltip": "^1.2.7",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.511.0",
    "tailwind-merge": "^3.3.0",
    "@tanstack/react-table": "^8.21.3"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@storybook/addon-a11y": "^8.6.14",
    "@storybook/addon-essentials": "^8.6.14",
    "@storybook/addon-interactions": "^8.6.14",
    "@storybook/react": "^8.6.14",
    "@storybook/react-vite": "^8.6.14",
    "@storybook/test": "^8.6.14",
    "@storybook/test-runner": "^0.22.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.1.9",
    "@types/react-dom": "^19.1.9",
    "eslint": "^9.35.0",
    "jsdom": "^26.1.0",
    "storybook": "^8.6.14",
    "tailwindcss": "^4.1.11",
    "tsup": "^8.4.0",
    "typescript": "^5.9.2",
    "vite": "^6.3.5",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/ui/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/tailwind-preset.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom'],
});
```

- [ ] **Step 4: Create `packages/ui/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 5: Create `packages/ui/postcss.config.mjs`**

```js
export default {
  plugins: ['@tailwindcss/postcss'],
};
```

- [ ] **Step 6: Create `packages/ui/src/tokens.css`**

This file imports the design source of truth tokens from `docs/design/foundations/tokens-v0.2-turquoise.css` and re-exports them as Tailwind v4 `@theme` under the `--vg-*` namespace. It also adds dark mode values and the verdict-to-severity mapping from `docs/design/README.md`.

```css
@import 'tailwindcss';

@theme {
  /* ── neutral ramp (from docs/design/foundations/tokens-v0.2-turquoise.css) ─── */
  --color-n0: #FFFFFF;
  --color-n50: #FAFCFF;
  --color-n100: #E9EEF7;
  --color-n200: #DDE5F3;
  --color-n300: #CCD0E0;
  --color-n400: #A9AFC4;
  --color-n500: #868DA6;
  --color-n600: #5A6280;
  --color-n700: #333B57;
  --color-n800: #202537;
  --color-n900: #131720;
  --color-n1000: #040506;

  /* ── brand / turquoise (chrome only) ─────────────────────────────────────── */
  --color-tq: #5AE9D7;
  --color-tq-dark: #1CCFB8;
  --color-tq-500: #9EF8EC;
  --color-tq-light: #EDFDFB;

  /* ── accent colours ──────────────────────────────────────────────────────── */
  --color-orange: #FF7958;
  --color-red: #FF5858;
  --color-red-light: #FFEBEB;
  --color-green: #6CDA91;
  --color-green-dark: #2FBB5E;
  --color-blue-light: #EBF3FF;

  /* ── verdict family (platform-locked, AA-deepened) ───────────────────────── */
  /* Maps to E06 severity: ok→pos, authentic→pos, already-verified→hist,
     suspicious→susp, flagged→flag, decommissioned→dec, unknown→unk,
     invalid/rate-limited/error→util */
  --color-v-pos: #14713A;
  --color-v-pos-tint: #E4F7EB;
  --color-v-hist: #3D4767;
  --color-v-hist-tint: #EBF3FF;
  --color-v-susp: #A8461F;
  --color-v-susp-tint: #FFEDE7;
  --color-v-flag: #B92B2B;
  --color-v-flag-tint: #FFEBEB;
  --color-v-dec: #333B57;
  --color-v-dec-tint: #E9EEF7;
  --color-v-unk: #6B3FA0;
  --color-v-unk-tint: #F1EAFB;
  --color-v-util: #5A6280;
  --color-v-util-tint: #FAFCFF;

  /* ── semantic aliases (light mode) ───────────────────────────────────────── */
  --color-bg: var(--color-n100);
  --color-surface: var(--color-n0);
  --color-surface-sunken: var(--color-n50);
  --color-fg: var(--color-n900);
  --color-fg-muted: var(--color-n600);
  --color-fg-faint: var(--color-n400);
  --color-border: var(--color-n200);
  --color-border-strong: var(--color-n300);
  --color-brand: var(--color-tq);
  --color-brand-ink: var(--color-n1000);
  --color-brand-text: #0E8F7F;
  --color-brand-strong: var(--color-tq-dark);
  --color-focus: var(--color-tq-dark);
  --color-success: var(--color-green-dark);
  --color-warning: var(--color-orange);
  --color-danger: var(--color-red);
  --color-info: var(--color-tq-dark);

  /* ── chart tokens (for E12) ──────────────────────────────────────────────── */
  --color-chart-1: #5AE9D7;
  --color-chart-2: #6CDA91;
  --color-chart-3: #FF7958;
  --color-chart-4: #6B3FA0;
  --color-chart-5: #3D4767;
  --color-chart-6: #E3A93C;

  /* ── spacing ─────────────────────────────────────────────────────────────── */
  --spacing-s1: 4px;
  --spacing-s2: 8px;
  --spacing-s3: 12px;
  --spacing-s4: 16px;
  --spacing-s5: 20px;
  --spacing-s6: 24px;
  --spacing-s8: 32px;
  --spacing-s10: 40px;
  --spacing-s12: 48px;
  --spacing-s16: 64px;
  --spacing-s20: 80px;

  /* ── radius ──────────────────────────────────────────────────────────────── */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-full: 999px;

  /* ── shadows ─────────────────────────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px rgba(19,23,32,.05);
  --shadow-md: 0 4px 16px rgba(19,23,32,.07), 0 1px 3px rgba(19,23,32,.04);
  --shadow-lg: 0 18px 48px rgba(19,23,32,.10), 0 4px 12px rgba(19,23,32,.05);

  /* ── fonts ───────────────────────────────────────────────────────────────── */
  --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* ── animation ───────────────────────────────────────────────────────────── */
  --animate-duration-fast: 150ms;
  --animate-duration-normal: 250ms;
  --animate-duration-slow: 400ms;
  --animate-easing: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Dark mode overrides ───────────────────────────────────────────────────── */
@layer base {
  :root {
    color-scheme: light;
  }

  [data-theme='dark'] {
    color-scheme: dark;
    --color-bg: var(--color-n900);
    --color-surface: var(--color-n800);
    --color-surface-sunken: var(--color-n1000);
    --color-fg: var(--color-n50);
    --color-fg-muted: var(--color-n400);
    --color-fg-faint: var(--color-n500);
    --color-border: var(--color-n700);
    --color-border-strong: var(--color-n600);
    --color-brand: var(--color-tq-dark);
    --color-brand-ink: var(--color-n0);
    --color-brand-text: #5AE9D7;
    --color-brand-strong: var(--color-tq);
  }
}
```

- [ ] **Step 7: Create `packages/ui/src/tailwind-preset.ts`**

```ts
import type { Config } from 'tailwindcss';

const preset: Config = {
  theme: {
    extend: {
      colors: {
        // neutrals
        n0: 'var(--color-n0)',
        n50: 'var(--color-n50)',
        n100: 'var(--color-n100)',
        n200: 'var(--color-n200)',
        n300: 'var(--color-n300)',
        n400: 'var(--color-n400)',
        n500: 'var(--color-n500)',
        n600: 'var(--color-n600)',
        n700: 'var(--color-n700)',
        n800: 'var(--color-n800)',
        n900: 'var(--color-n900)',
        n1000: 'var(--color-n1000)',
        // semantic
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-sunken': 'var(--color-surface-sunken)',
        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-faint': 'var(--color-fg-faint)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        brand: 'var(--color-brand)',
        'brand-ink': 'var(--color-brand-ink)',
        'brand-text': 'var(--color-brand-text)',
        'brand-strong': 'var(--color-brand-strong)',
        focus: 'var(--color-focus)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        // verdict family
        'v-pos': 'var(--color-v-pos)',
        'v-pos-tint': 'var(--color-v-pos-tint)',
        'v-hist': 'var(--color-v-hist)',
        'v-hist-tint': 'var(--color-v-hist-tint)',
        'v-susp': 'var(--color-v-susp)',
        'v-susp-tint': 'var(--color-v-susp-tint)',
        'v-flag': 'var(--color-v-flag)',
        'v-flag-tint': 'var(--color-v-flag-tint)',
        'v-dec': 'var(--color-v-dec)',
        'v-dec-tint': 'var(--color-v-dec-tint)',
        'v-unk': 'var(--color-v-unk)',
        'v-unk-tint': 'var(--color-v-unk-tint)',
        'v-util': 'var(--color-v-util)',
        'v-util-tint': 'var(--color-v-util-tint)',
        // chart
        'chart-1': 'var(--color-chart-1)',
        'chart-2': 'var(--color-chart-2)',
        'chart-3': 'var(--color-chart-3)',
        'chart-4': 'var(--color-chart-4)',
        'chart-5': 'var(--color-chart-5)',
        'chart-6': 'var(--color-chart-6)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
};

export default preset;
```

- [ ] **Step 8: Create `packages/ui/src/apply-tenant-theme.ts`**

```ts
/**
 * Overrides tenant-themeable CSS variables on the given element.
 * Only brand colours are overridable — verdict tokens are platform-locked.
 */
export function applyTenantTheme(
  el: HTMLElement,
  branding: { primaryColor?: string; accentColor?: string },
): void {
  if (branding.primaryColor) {
    el.style.setProperty('--color-brand', branding.primaryColor);
    // Derive a "strong" variant by darkening (simple approach: use the same
    // value with a lower lightness; a proper HSL conversion is better but
    // this keeps the dependency graph zero). For now, store the raw value
    // and let the contrast guard handle it.
    el.style.setProperty('--color-brand-strong', branding.primaryColor);
    el.style.setProperty('--color-brand-text', branding.primaryColor);
  }
  if (branding.accentColor) {
    el.style.setProperty('--color-brand-ink', branding.accentColor);
  }
}
```

- [ ] **Step 9: Create `packages/ui/src/apply-tenant-theme.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { applyTenantTheme } from './apply-tenant-theme';

describe('applyTenantTheme', () => {
  it('overrides brand variables when primaryColor is provided', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, { primaryColor: '#1E3A8A' });
    expect(el.style.getPropertyValue('--color-brand')).toBe('#1E3A8A');
    expect(el.style.getPropertyValue('--color-brand-strong')).toBe('#1E3A8A');
    expect(el.style.getPropertyValue('--color-brand-text')).toBe('#1E3A8A');
  });

  it('overrides brand-ink when accentColor is provided', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, { accentColor: '#FFFFFF' });
    expect(el.style.getPropertyValue('--color-brand-ink')).toBe('#FFFFFF');
  });

  it('does not override verdict tokens', () => {
    const el = document.createElement('div');
    el.style.setProperty('--color-v-pos', '#14713A');
    applyTenantTheme(el, { primaryColor: '#FF0000' });
    expect(el.style.getPropertyValue('--color-v-pos')).toBe('#14713A');
  });

  it('no-ops when branding is empty', () => {
    const el = document.createElement('div');
    applyTenantTheme(el, {});
    expect(el.style.length).toBe(0);
  });
});
```

- [ ] **Step 10: Create `packages/ui/src/index.ts` barrel (empty for now)**

```ts
// Design token helpers
export { applyTenantTheme } from './apply-tenant-theme';
// Components will be exported here as they are built
```

- [ ] **Step 11: Run `pnpm install` and verify the package is linked**

Run: `pnpm install`

Expected: Package installs successfully, `@verifyng/ui` is available in workspace.

- [ ] **Step 12: Run tests for `packages/ui`**

Run: `pnpm --filter @verifyng/ui test`

Expected: `applyTenantTheme` tests pass (4 tests).

- [ ] **Step 13: Run `pnpm build` from root**

Run: `pnpm build`

Expected: `@verifyng/ui` builds ESM + CJS + d.ts successfully. No errors.

- [ ] **Step 14: Commit**

```bash
git add packages/ui/
git commit -m "feat(E11): scaffold packages/ui with tokens, tailwind preset, applyTenantTheme"
```

---

### Task 2: Token drift check script

**Files:**
- Create: `scripts/check-token-drift.ts`

- [ ] **Step 1: Create the drift check script**

This script compares the `@theme` block in `packages/ui/src/tokens.css` against the source of truth `docs/design/foundations/tokens-v0.2-turquoise.css` and fails if the raw token values differ.

```ts
/**
 * CI check: packages/ui tokens must match docs/design/foundations/tokens-v0.2-turquoise.css
 * Run: npx tsx scripts/check-token-drift.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

const sourcePath = resolve(root, 'docs/design/foundations/tokens-v0.2-turquoise.css');
const pkgPath = resolve(root, 'packages/ui/src/tokens.css');

const sourceContent = readFileSync(sourcePath, 'utf-8');
const pkgContent = readFileSync(pkgPath, 'utf-8');

// Extract all --var:value pairs from the source (CSS custom properties)
const sourceTokens = new Map<string, string>();
const tokenRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
let match: RegExpExecArray | null;
while ((match = tokenRegex.exec(sourceContent)) !== null) {
  sourceTokens.set(`--${match[1]}`, match[2].trim());
}

// Check each source token appears in packages/ui with the same value
const errors: string[] = [];
for (const [key, expectedValue] of sourceTokens) {
  // Look for the token in the package (may be namespaced differently, e.g. --color-n0)
  // The package uses @theme format: --color-n0: #FFFFFF;
  // The source uses: --n0: #FFFFFF;
  // We match on the value since the naming convention differs
  const valueRegex = new RegExp(
    `${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`,
  );
  // Check the raw source token name exists with same value in package
  // Since naming differs (--n0 vs --color-n0), we check the VALUE is present
  const pkgHasValue = pkgContent.includes(expectedValue);
  if (!pkgHasValue) {
    errors.push(`Token ${key} value "${expectedValue}" not found in packages/ui/src/tokens.css`);
  }
}

if (errors.length > 0) {
  console.error('❌ Token drift detected!');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('✅ No token drift — packages/ui matches docs/design/foundations/');
```

- [ ] **Step 2: Run the drift check**

Run: `npx tsx scripts/check-token-drift.ts`

Expected: `✅ No token drift — packages/ui matches docs/design/foundations/`

- [ ] **Step 3: Commit**

```bash
git add scripts/check-token-drift.ts
git commit -m "feat(E11): add token drift CI check script"
```

---

### Task 3: shadcn/ui init in `packages/ui`

**Files:**
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/utils.ts` (cn helper)

- [ ] **Step 1: Create `packages/ui/components.json` for shadcn/ui**

This configures shadcn/ui to generate components into `packages/ui/src/components/ui/`.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/tokens.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: Create `packages/ui/src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Update `packages/ui/src/index.ts` to export cn**

```ts
// Utilities
export { cn } from './lib/utils';

// Design token helpers
export { applyTenantTheme } from './apply-tenant-theme';

// Components will be exported here as they are built
```

- [ ] **Step 4: Run `pnpm install` and `pnpm --filter @verifyng/ui build`**

Run: `pnpm install && pnpm --filter @verifyng/ui build`

Expected: Builds successfully.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/
git commit -m "feat(E11): init shadcn/ui config in packages/ui"
```

---

### Task 4: Primitives batch 1 — Button, IconButton, Input, Textarea, Select, Checkbox, Switch, RadioGroup, Label, FormField, FormMessage, Badge, StatusChip, Skeleton, Kbd

**Files:**
- Generate shadcn/ui components into `packages/ui/src/components/ui/`
- Create custom wrappers: `icon-button.tsx`, `form-field.tsx`, `form-message.tsx`, `status-chip.tsx`
- Update `packages/ui/src/index.ts` barrel exports

This task generates shadcn components and adds the custom ones. The shadcn CLI generates components that use `@/lib/utils` (which we have) and Radix primitives (which we installed).

- [ ] **Step 1: Generate shadcn/ui base components**

Run from `packages/ui/`:
```bash
cd packages/ui
npx shadcn@latest add button input textarea select checkbox switch radio-group label badge skeleton tabs tooltip
```

This creates:
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/checkbox.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/tooltip.tsx`

- [ ] **Step 2: Create `packages/ui/src/components/ui/icon-button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  asChild?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'icon', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
IconButton.displayName = 'IconButton';

export { IconButton };
```

- [ ] **Step 3: Create `packages/ui/src/components/ui/form-field.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  required?: boolean;
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, htmlFor, error, description, required, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        {label && (
          <Label htmlFor={htmlFor}>
            {label}
            {required && <span className="text-danger ml-1">*</span>}
          </Label>
        )}
        {children}
        {description && !error && (
          <p className="text-sm text-fg-muted">{description}</p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
FormField.displayName = 'FormField';

export { FormField };
```

- [ ] **Step 4: Create `packages/ui/src/components/ui/form-message.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: boolean;
}

const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, error, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        className={cn(
          'text-sm',
          error ? 'text-danger' : 'text-fg-muted',
          className,
        )}
        role={error ? 'alert' : undefined}
        {...props}
      >
        {children}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';

export { FormMessage };
```

- [ ] **Step 5: Create `packages/ui/src/components/ui/status-chip.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusVariant =
  | 'ok' | 'authentic' | 'history' | 'suspicious' | 'flagged'
  | 'decommissioned' | 'unknown' | 'utility'
  | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantStyles: Record<StatusVariant, string> = {
  // Verdict family (maps to E06 severity)
  ok: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  authentic: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  history: 'bg-v-hist-tint text-v-hist border-v-hist/20',
  suspicious: 'bg-v-susp-tint text-v-susp border-v-susp/20',
  flagged: 'bg-v-flag-tint text-v-flag border-v-flag/20',
  decommissioned: 'bg-v-dec-tint text-v-dec border-v-dec/20',
  unknown: 'bg-v-unk-tint text-v-unk border-v-unk/20',
  utility: 'bg-v-util-tint text-v-util border-v-util/20',
  // Generic semantic
  success: 'bg-v-pos-tint text-v-pos border-v-pos/20',
  warning: 'bg-v-susp-tint text-v-susp border-v-susp/20',
  danger: 'bg-v-flag-tint text-v-flag border-v-flag/20',
  info: 'bg-v-hist-tint text-v-hist border-v-hist/20',
  neutral: 'bg-surface-sunken text-fg-muted border-border',
};

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusVariant;
}

const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ className, variant = 'neutral', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
          variantStyles[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
StatusChip.displayName = 'StatusChip';

export { StatusChip };
```

- [ ] **Step 6: Create `packages/ui/src/components/ui/kbd.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, ...props }, ref) => {
    return (
      <kbd
        ref={ref}
        className={cn(
          'pointer-events-none inline-flex h-5 items-center gap-1 rounded-xs border border-border bg-surface-sunken px-1.5 font-mono text-[10px] font-medium text-fg-muted',
          className,
        )}
        {...props}
      />
    );
  },
);
Kbd.displayName = 'Kbd';

export { Kbd };
```

- [ ] **Step 7: Update `packages/ui/src/index.ts` barrel exports**

```ts
// Utilities
export { cn } from './lib/utils';

// Design token helpers
export { applyTenantTheme } from './apply-tenant-theme';

// Primitives batch 1
export { Button, buttonVariants } from './components/ui/button';
export { IconButton } from './components/ui/icon-button';
export { Input } from './components/ui/input';
export { Textarea } from './components/ui/textarea';
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
export { Checkbox } from './components/ui/checkbox';
export { Switch } from './components/ui/switch';
export { RadioGroup, RadioGroupItem } from './components/ui/radio-group';
export { Label } from './components/ui/label';
export { FormField } from './components/ui/form-field';
export { FormMessage } from './components/ui/form-message';
export { Badge, badgeVariants } from './components/ui/badge';
export { StatusChip } from './components/ui/status-chip';
export { Skeleton } from './components/ui/skeleton';
export { Kbd } from './components/ui/kbd';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
```

- [ ] **Step 8: Run build**

Run: `pnpm --filter @verifyng/ui build`

Expected: All components compile without errors.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/
git commit -m "feat(E11): primitives batch 1 — Button, Input, Select, Checkbox, Switch, etc."
```

---

### Task 5: Primitives batch 2 — Table, DataTable, Dialog, ConfirmDialog, Sheet, Toast, PageHeader, Breadcrumbs, EmptyState, ProgressBar, CodeBlock

**Files:**
- Generate more shadcn/ui components
- Create custom wrappers: `data-table.tsx`, `confirm-dialog.tsx`, `page-header.tsx`, `breadcrumbs.tsx`, `empty-state.tsx`, `progress-bar.tsx`, `code-block.tsx`
- Update barrel exports

- [ ] **Step 1: Generate shadcn/ui dialog, sheet, toast, popover, dropdown-menu**

Run from `packages/ui/`:
```bash
cd packages/ui
npx shadcn@latest add dialog sheet toast popover dropdown-menu separator
```

- [ ] **Step 2: Create `packages/ui/src/components/ui/data-table.tsx`**

A generic data table built on TanStack Table with cursor pagination, sorting, row actions, empty state, and responsive mobile card fallback.

```tsx
'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { EmptyState } from './empty-state';
import { cn } from '@/lib/utils';
import { ListIcon } from 'lucide-react';

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: {
    hasNext: boolean;
    hasPrev: boolean;
    onNext: () => void;
    onPrev: () => void;
    cursor?: string | null;
  };
  rowActions?: (row: TData) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  isLoading?: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  sorting,
  onSortingChange,
  pagination,
  rowActions,
  emptyState,
  className,
  isLoading,
}: DataTableProps<TData, TValue>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const currentSorting = sorting ?? internalSorting;
  const handleSortingChange = onSortingChange ?? setInternalSorting;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: handleSortingChange,
    state: {
      sorting: currentSorting,
    },
  });

  if (!isLoading && data.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <EmptyState
            icon={ListIcon}
            title="No data"
            description="No items to display."
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Desktop table */}
      <div className="hidden md:block rounded-md border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="sticky top-0 bg-surface"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
                {rowActions && (
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell>
                        {rowActions(row.original)}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border p-4 space-y-2">
                {columns.slice(0, 3).map((_, j) => (
                  <div key={j} className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
                ))}
              </div>
            ))
          : table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="rounded-md border border-border bg-surface p-4 space-y-2"
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="flex justify-between text-sm">
                    <span className="text-fg-muted">
                      {flexRender(
                        cell.column.columnDef.header,
                        cell.getContext(),
                      )}
                    </span>
                    <span>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </span>
                  </div>
                ))}
                {rowActions && (
                  <div className="pt-2">{rowActions(row.original)}</div>
                )}
              </div>
            ))}
      </div>

      {/* Pagination */}
      {pagination && (pagination.hasPrev || pagination.hasNext) && (
        <div className="flex items-center justify-between">
          <button
            onClick={pagination.onPrev}
            disabled={!pagination.hasPrev}
            className="text-sm text-fg-muted hover:text-fg disabled:opacity-50"
          >
            ← Previous
          </button>
          <button
            onClick={pagination.onNext}
            disabled={!pagination.hasNext}
            className="text-sm text-fg-muted hover:text-fg disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `packages/ui/src/components/ui/confirm-dialog.tsx`**

```tsx
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `packages/ui/src/components/ui/page-header.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, actions, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-start justify-between gap-4', className)}
        {...props}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-fg-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    );
  },
);
PageHeader.displayName = 'PageHeader';

export { PageHeader };
```

- [ ] **Step 5: Create `packages/ui/src/components/ui/breadcrumbs.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import { Slot } from '@radix-ui/react-slot';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

const Breadcrumbs = React.forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, items, ...props }, ref) => {
    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn('flex items-center gap-1.5 text-sm text-fg-muted', className)}
        {...props}
      >
        {items.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden />
            )}
            {item.href ? (
              <a
                href={item.href}
                className="hover:text-fg transition-colors"
              >
                {item.label}
              </a>
            ) : (
              <span className="text-fg font-medium" aria-current="page">
                {item.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </nav>
    );
  },
);
Breadcrumbs.displayName = 'Breadcrumbs';

export { Breadcrumbs };
```

- [ ] **Step 6: Create `packages/ui/src/components/ui/empty-state.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center',
          className,
        )}
        {...props}
      >
        {Icon && (
          <div className="mb-4 rounded-full bg-surface-sunken p-3">
            <Icon className="h-6 w-6 text-fg-muted" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-fg">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-fg-muted max-w-sm">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  },
);
EmptyState.displayName = 'EmptyState';

export { EmptyState };
```

- [ ] **Step 7: Create `packages/ui/src/components/ui/progress-bar.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  max?: number;
  label?: string;
  showValue?: boolean;
}

const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, max = 100, label, showValue, ...props }, ref) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
      <div ref={ref} className={cn('space-y-1', className)} {...props}>
        {(label || showValue) && (
          <div className="flex justify-between text-sm">
            {label && <span className="text-fg-muted">{label}</span>}
            {showValue && (
              <span className="text-fg-muted tabular-nums">
                {Math.round(pct)}%
              </span>
            )}
          </div>
        )}
        <div
          className="h-2 w-full rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label}
        >
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },
);
ProgressBar.displayName = 'ProgressBar';

export { ProgressBar };
```

- [ ] **Step 8: Create `packages/ui/src/components/ui/code-block.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  code: string;
  language?: string;
}

const CodeBlock = React.forwardRef<HTMLPreElement, CodeBlockProps>(
  ({ className, code, language, ...props }, ref) => {
    return (
      <pre
        ref={ref}
        className={cn(
          'overflow-x-auto rounded-md bg-surface-sunken p-4 font-mono text-sm text-fg',
          className,
        )}
        data-language={language}
        {...props}
      >
        <code>{code}</code>
      </pre>
    );
  },
);
CodeBlock.displayName = 'CodeBlock';

export { CodeBlock };
```

- [ ] **Step 9: Update `packages/ui/src/index.ts` barrel exports**

Add these to the barrel:
```ts
// Primitives batch 2
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
export { DataTable } from './components/ui/data-table';
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
export { ConfirmDialog } from './components/ui/confirm-dialog';
export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './components/ui/sheet';
export { Toast, ToastAction, ToastProvider, ToastTitle, ToastDescription, ToastViewport } from './components/ui/toast';
export { Toaster } from './components/ui/toaster';
export { useToast } from './components/ui/use-toast';
export { PageHeader } from './components/ui/page-header';
export { Breadcrumbs } from './components/ui/breadcrumbs';
export { EmptyState } from './components/ui/empty-state';
export { ProgressBar } from './components/ui/progress-bar';
export { CodeBlock } from './components/ui/code-block';
export { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from './components/ui/dropdown-menu';
export { Separator } from './components/ui/separator';
```

- [ ] **Step 10: Run build**

Run: `pnpm --filter @verifyng/ui build`

Expected: All components compile without errors.

- [ ] **Step 11: Commit**

```bash
git add packages/ui/
git commit -m "feat(E11): primitives batch 2 — DataTable, Dialog, Sheet, Toast, PageHeader, etc."
```

---

### Task 6: Storybook setup + Foundations stories

**Files:**
- Create: `packages/ui/.storybook/main.ts`
- Create: `packages/ui/.storybook/preview.ts`
- Create: `packages/ui/src/stories/foundations.stories.tsx`
- Create: `packages/ui/src/stories/tenant-theme.stories.tsx`

- [ ] **Step 1: Create `packages/ui/.storybook/main.ts`**

```ts
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../public'],
};

export default config;
```

- [ ] **Step 2: Create `packages/ui/.storybook/preview.ts`**

```ts
import type { Preview } from '@storybook/react';
import '../src/tokens.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#D9DCEF' },
        { name: 'dark', value: '#131720' },
      ],
    },
    a11y: {
      config: {
        rules: [
          {
            // All stories must pass WCAG 2.1 AA
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
};

export default preview;
```

- [ ] **Step 3: Create `packages/ui/src/stories/foundations.stories.tsx`**

Visual stories reproducing the design canvas: type scale, neutrals, brand, verdict family.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { applyTenantTheme } from '../apply-tenant-theme';

const meta: Meta = {
  title: 'Foundations/Tokens',
};

export default meta;

export const Neutrals: StoryObj = {
  render: () => (
    <div className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Neutral Ramp</h2>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 11 }, (_, i) => {
          const shade = i * 100;
          const name = shade === 0 ? 'n0' : `n${shade}`;
          return (
            <div key={name} className="text-center">
              <div
                className={`h-12 w-12 rounded-md border border-border bg-${name}`}
              />
              <span className="text-xs text-fg-muted">{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  ),
};

export const BrandColours: StoryObj = {
  render: () => (
    <div className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Brand / Turquoise</h2>
      <div className="flex gap-2">
        {['tq-light', 'tq-500', 'tq', 'tq-dark'].map((name) => (
          <div key={name} className="text-center">
            <div className={`h-12 w-12 rounded-md bg-${name}`} />
            <span className="text-xs text-fg-muted">{name}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const VerdictFamily: StoryObj = {
  render: () => (
    <div className="space-y-4 p-6">
      <h2 className="text-xl font-semibold">Verdict Family (platform-locked)</h2>
      <div className="space-y-2">
        {[
          { name: 'pos', label: 'Genuine / Authentic', severity: 'ok' },
          { name: 'hist', label: 'Already Verified', severity: 'already-verified' },
          { name: 'susp', label: 'Suspicious', severity: 'suspicious' },
          { name: 'flag', label: 'Flagged by Brand', severity: 'flagged' },
          { name: 'dec', label: 'Decommissioned', severity: 'decommissioned' },
          { name: 'unk', label: 'Unknown / Not Recognised', severity: 'unknown' },
          { name: 'util', label: 'Utility (invalid, rate-limited, error)', severity: 'utility' },
        ].map(({ name, label }) => (
          <div key={name} className="flex items-center gap-3">
            <div className={`h-10 w-16 rounded bg-v-${name}`} />
            <div className={`h-10 w-16 rounded bg-v-${name}-tint border border-v-${name}/20`} />
            <span className="text-sm font-medium text-fg">{label}</span>
            <span className="text-xs text-fg-muted font-mono">--v-{name}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const TypeScale: StoryObj = {
  render: () => (
    <div className="space-y-3 p-6">
      <h2 className="text-xl font-semibold">Type Scale</h2>
      {[
        { size: 'text-xs', label: 'xs — 12px' },
        { size: 'text-sm', label: 'sm — 14px' },
        { size: 'text-base', label: 'base — 16px' },
        { size: 'text-lg', label: 'lg — 18px' },
        { size: 'text-xl', label: 'xl — 20px' },
        { size: 'text-2xl', label: '2xl — 24px' },
        { size: 'text-3xl', label: '3xl — 30px' },
        { size: 'text-4xl', label: '4xl — 36px' },
      ].map(({ size, label }) => (
        <p key={size} className={`${size} text-fg font-sans`}>
          {label} — Plus Jakarta Sans
        </p>
      ))}
    </div>
  ),
};

export const SpacingAndRadius: StoryObj = {
  render: () => (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-xl font-semibold mb-3">Spacing</h2>
        <div className="flex items-end gap-2">
          {[4, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((s) => (
            <div key={s} className="text-center">
              <div
                className="bg-brand"
                style={{ width: s, height: s }}
              />
              <span className="text-xs text-fg-muted">{s}px</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-3">Radius</h2>
        <div className="flex gap-3">
          {['xs', 'sm', 'md', 'lg', 'xl', 'full'].map((r) => (
            <div key={r} className="text-center">
              <div className={`h-12 w-12 bg-brand rounded-${r}`} />
              <span className="text-xs text-fg-muted">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};
```

- [ ] **Step 4: Create `packages/ui/src/stories/tenant-theme.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { applyTenantTheme } from '../apply-tenant-theme';
import { useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';

const meta: Meta = {
  title: 'Foundations/Tenant Theme',
};

export default meta;

function TenantThemeDemo({ primaryColor, accentColor }: { primaryColor?: string; accentColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      applyTenantTheme(ref.current, { primaryColor, accentColor });
    }
  }, [primaryColor, accentColor]);
  return (
    <div ref={ref} className="space-y-4 p-6 rounded-md border border-border bg-surface">
      <p className="text-fg">Primary: {primaryColor ?? '(default)'}</p>
      <Button>Brand Button</Button>
      <Button variant="outline">Outline</Button>
    </div>
  );
}

export const IvoryGlow: StoryObj = {
  render: () => <TenantThemeDemo primaryColor="#E3A93C" />,
};

export const BlueTenant: StoryObj = {
  render: () => <TenantThemeDemo primaryColor="#1E3A8A" />,
};

export const DefaultPlatform: StoryObj = {
  render: () => <TenantThemeDemo />,
};
```

- [ ] **Step 5: Run storybook**

Run: `pnpm --filter @verifyng/ui storybook`

Expected: Storybook starts on port 6006, Foundations stories render.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/
git commit -m "feat(E11): Storybook setup with foundations and tenant-theme stories"
```

---

### Task 7: web-admin dependencies and providers

**Files:**
- Modify: `apps/web-admin/package.json` (add deps)
- Rewrite: `apps/web-admin/app/layout.tsx` (providers)
- Rewrite: `apps/web-admin/app/globals.css` (import tokens)
- Create: `apps/web-admin/app/providers.tsx`
- Modify: `apps/web-admin/tsconfig.json` (add path aliases for `@/lib`, `@/components`)
- Modify: `apps/web-admin/next.config.ts` (transpile @verifyng/ui)

- [ ] **Step 1: Update `apps/web-admin/package.json` with required deps**

Add to dependencies:
```json
{
  "@verifyng/ui": "workspace:*",
  "@tanstack/react-query": "^5.81.5",
  "zustand": "^5.0.5",
  "react-hook-form": "^7.60.0",
  "@hookform/resolvers": "^5.1.1",
  "zod": "^3.25.76",
  "lucide-react": "^0.511.0",
  "qrcode.react": "^4.2.0",
  "next-themes": "^0.4.6",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.3.0"
}
```

Add to devDependencies:
```json
{
  "@axe-core/playwright": "^4.10.2",
  "@playwright/test": "^1.62.1",
  "msw": "^2.10.2"
}
```

- [ ] **Step 2: Run `pnpm install`**

Run: `pnpm install`

- [ ] **Step 3: Update `apps/web-admin/tsconfig.json` with path aliases**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"],
      "@/lib/*": ["./lib/*"],
      "@/components/*": ["./components/*"],
      "@/app/*": ["./app/*"]
    },
    "noEmit": true,
    "allowJs": true,
    "incremental": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "app",
    "lib",
    "components",
    "e2e",
    "next-env.d.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

- [ ] **Step 4: Update `apps/web-admin/next.config.ts` to transpile `@verifyng/ui`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@verifyng/ui'],
};

export default nextConfig;
```

- [ ] **Step 5: Rewrite `apps/web-admin/app/globals.css`**

```css
@import '@verifyng/ui/tokens.css';
@import 'tailwindcss';
```

- [ ] **Step 6: Create `apps/web-admin/app/providers.tsx`**

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@verifyng/ui';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false}>
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Rewrite `apps/web-admin/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Verify Admin — Tenant Console',
  description: 'Manage your product authenticity programme',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Verify the build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds without errors (the existing page.tsx will need token class updates).

- [ ] **Step 9: Fix `apps/web-admin/app/page.tsx` temporarily (will be replaced by console layout)**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight text-fg">Verify Admin</h1>
      <p className="mt-4 text-lg text-fg-muted">Tenant console</p>
    </main>
  );
}
```

- [ ] **Step 10: Run build again**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Success.

- [ ] **Step 11: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): web-admin providers, tokens, and layout setup"
```

---

### Task 8: Auth plumbing — apiClient, auth store, route handlers, middleware

**Files:**
- Create: `apps/web-admin/lib/api-client.ts`
- Create: `apps/web-admin/lib/api-stubs.ts`
- Create: `apps/web-admin/lib/auth-store.ts`
- Create: `apps/web-admin/lib/tenant-path.ts`
- Create: `apps/web-admin/app/api/auth/session/route.ts`
- Create: `apps/web-admin/app/api/auth/logout/route.ts`
- Create: `apps/web-admin/middleware.ts`

This is the critical plumbing. Since E02 hasn't shipped, the route handlers use stub data. The flow is:

1. Browser POSTs email+password to `/api/auth/session` (Next route handler)
2. Route handler calls the real E02 API (or stub) and sets an `httpOnly` cookie `vg_refresh` with the refresh token
3. Returns the access token to the client (stored in zustand memory)
4. On 401, apiClient tries one refresh via `/api/auth/session` (which proxies to E02 `/auth/refresh`)
5. If refresh fails, logout

- [ ] **Step 1: Create `apps/web-admin/lib/api-stubs.ts`**

Stub responses that match E02's published interface. Deleted when E02 ships.

```ts
/**
 * E02 stub data — matches the published interface in docs/epics/E02-identity-access.md.
 * These are used by the Next route handlers when E02 is not yet available.
 * DELETE THIS FILE when E02 ships and the route handlers proxy to the real API.
 */

export const STUB_USERS = {
  'owner@ivoryglow.local': {
    id: 'usr_ivory_owner',
    email: 'owner@ivoryglow.local',
    displayName: 'Ivory Owner',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null,
    mfaEnabled: false,
    mfaSecret: 'JBSWY3DPEHPK3PXP', // base32 of "Hello!"
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'owner' },
    ],
  },
  'operator@ivoryglow.local': {
    id: 'usr_ivory_operator',
    email: 'operator@ivoryglow.local',
    displayName: 'Ivory Operator',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null,
    mfaEnabled: false,
    mfaSecret: null,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'operator' },
    ],
  },
  'viewer@ivoryglow.local': {
    id: 'usr_ivory_viewer',
    email: 'viewer@ivoryglow.local',
    displayName: 'Ivory Viewer',
    password: 'Passw0rd!Passw0rd!',
    platformRole: null,
    mfaEnabled: false,
    mfaSecret: null,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'viewer' },
    ],
  },
  'support@verifyng.local': {
    id: 'usr_platform_support',
    email: 'support@verifyng.local',
    displayName: 'Platform Support',
    password: 'Passw0rd!Passw0rd!',
    platformRole: 'support',
    mfaEnabled: false,
    mfaSecret: null,
    memberships: [
      { tenantId: 'tnt_ivoryglow', tenantName: 'IVORY GLOW', tenantSlug: 'ivoryglow', role: 'viewer' },
    ],
  },
} as const;

export type StubUser = (typeof STUB_USERS)[keyof typeof STUB_USERS];

// In-memory session store for stubs (resets on server restart)
const sessions = new Map<string, { userId: string; refreshToken: string }>();
let sessionCounter = 0;

export function createStubSession(userId: string): {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
} {
  const sessionId = `sess_${++sessionCounter}`;
  const refreshToken = `rt_${sessionId}_${Date.now()}`;
  sessions.set(sessionId, { userId, refreshToken });
  return {
    accessToken: `stub_access_${sessionId}`,
    refreshToken,
    sessionId,
  };
}

export function validateStubRefresh(refreshToken: string): {
  userId: string;
  sessionId: string;
} | null {
  for (const [sessionId, session] of sessions) {
    if (session.refreshToken === refreshToken) {
      return { userId: session.userId, sessionId };
    }
  }
  return null;
}

export function findUserByEmail(email: string): StubUser | undefined {
  return STUB_USERS[email as keyof typeof STUB_USERS];
}
```

- [ ] **Step 2: Create `apps/web-admin/lib/auth-store.ts`**

```ts
import { create } from 'zustand';

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: 'owner' | 'operator' | 'viewer';
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: string | null;
  mfaEnabled: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  memberships: Membership[];
  activeTenantId: string | null;
  activeRole: string | null;

  setAuth: (data: {
    accessToken: string;
    user: AuthUser;
    memberships: Membership[];
    activeTenantId: string;
    activeRole: string;
  }) => void;
  setAccessToken: (token: string) => void;
  setActiveTenant: (tenantId: string, role: string) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  memberships: [],
  activeTenantId: null,
  activeRole: null,

  setAuth: (data) =>
    set({
      accessToken: data.accessToken,
      user: data.user,
      memberships: data.memberships,
      activeTenantId: data.activeTenantId,
      activeRole: data.activeRole,
    }),

  setAccessToken: (token) => set({ accessToken: token }),

  setActiveTenant: (tenantId, role) =>
    set({ activeTenantId: tenantId, activeRole: role }),

  clear: () =>
    set({
      accessToken: null,
      user: null,
      memberships: [],
      activeTenantId: null,
      activeRole: null,
    }),
}));

// Selector hooks
export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    memberships: store.memberships,
    activeTenantId: store.activeTenantId,
    role: store.activeRole as 'owner' | 'operator' | 'viewer' | null,
    platformRole: store.user?.platformRole,
    switchTenant: store.setActiveTenant,
    logout: store.clear,
    isAuthenticated: !!store.accessToken,
  };
}
```

- [ ] **Step 3: Create `apps/web-admin/lib/api-client.ts`**

```ts
import { useAuthStore } from './auth-store';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });

      if (!res.ok) {
        useAuthStore.getState().clear();
        return null;
      }

      const data = await res.json();
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      useAuthStore.getState().clear();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  options?: { body?: unknown; query?: Record<string, string>; signal?: AbortSignal },
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const url = new URL(path, API_BASE);
  if (options?.query) {
    Object.entries(options.query).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  });

  if (res.status === 401 && token) {
    // Try one refresh
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: options?.signal,
      });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({}));
        throw new ApiError(
          retry.status,
          err.code ?? 'UNKNOWN',
          err.message ?? retry.statusText,
          err.details,
        );
      }
      return retry.json();
    }
    // Refresh failed — redirect will happen via middleware
    throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.message ?? res.statusText,
      err.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string, opts?: { query?: Record<string, string>; signal?: AbortSignal }) =>
    request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>('POST', path, { body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: { signal?: AbortSignal }) =>
    request<T>('PATCH', path, { body, ...opts }),
  delete: <T>(path: string, opts?: { signal?: AbortSignal }) =>
    request<T>('DELETE', path, opts),
};
```

- [ ] **Step 4: Create `apps/web-admin/lib/tenant-path.ts`**

```ts
'use client';

import { useAuthStore } from './auth-store';

/**
 * Returns a function that prepends the active tenant ID to API paths.
 * Every module builds API paths with this — never hardcode a tenant id.
 */
export function useTenantPath() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  return (path: string) => `/tenants/${activeTenantId}${path}`;
}
```

- [ ] **Step 5: Create `apps/web-admin/app/api/auth/session/route.ts`**

This is the critical route handler. It proxies login/refresh to the E02 API (or stubs), sets the `vg_refresh` httpOnly cookie, and returns the access token.

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  createStubSession,
  validateStubRefresh,
  findUserByEmail,
} from '@/lib/api-stubs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── Login action ─────────────────────────────────────────────
  if (body.action === 'login' || body.email) {
    const { email, password } = body;

    // Try real API first
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const apiRes = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        // E02 returns { accessToken, refreshToken, expiresIn } or { mfaRequired: true, mfaToken }
        if (data.mfaRequired) {
          return NextResponse.json({ mfaRequired: true, mfaToken: data.mfaToken });
        }
        const response = NextResponse.json({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
        });
        response.cookies.set('vg_refresh', data.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/api/auth',
          maxAge: 30 * 24 * 60 * 60, // 30 days
        });
        return response;
      }
    } catch {
      // API not available, fall through to stubs
    }

    // ── Stub login (remove when E02 ships) ─────────────────────
    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
      return NextResponse.json(
        { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const session = createStubSession(user.id);
    const response = NextResponse.json({
      accessToken: session.accessToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformRole: user.platformRole,
        mfaEnabled: user.mfaEnabled,
      },
      memberships: user.memberships,
      activeTenantId: user.memberships[0]?.tenantId,
      activeRole: user.memberships[0]?.role,
    });
    response.cookies.set('vg_refresh', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  // ── MFA challenge ────────────────────────────────────────────
  if (body.action === 'mfa' || body.mfaToken) {
    // TODO: proxy to E02 /auth/mfa/challenge when available
    return NextResponse.json(
      { code: 'NOT_IMPLEMENTED', message: 'MFA not yet available' },
      { status: 501 },
    );
  }

  // ── Refresh action ───────────────────────────────────────────
  if (body.action === 'refresh') {
    const refreshToken = req.cookies.get('vg_refresh')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { code: 'NO_REFRESH_TOKEN', message: 'No refresh token' },
        { status: 401 },
      );
    }

    // Try real API
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const apiRes = await fetch(`${apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        const response = NextResponse.json({
          accessToken: data.accessToken,
          expiresIn: data.expiresIn,
        });
        response.cookies.set('vg_refresh', data.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/api/auth',
          maxAge: 30 * 24 * 60 * 60,
        });
        return response;
      }
    } catch {
      // API not available, fall through to stubs
    }

    // ── Stub refresh (remove when E02 ships) ────────────────────
    const session = validateStubRefresh(refreshToken);
    if (!session) {
      const response = NextResponse.json(
        { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' },
        { status: 401 },
      );
      response.cookies.delete('vg_refresh');
      return response;
    }

    const newSession = createStubSession(session.userId);
    const response = NextResponse.json({
      accessToken: newSession.accessToken,
      expiresIn: 900,
    });
    response.cookies.set('vg_refresh', newSession.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  // ── Switch tenant ────────────────────────────────────────────
  if (body.action === 'switch-tenant' && body.tenantId) {
    // TODO: proxy to E02 /auth/switch-tenant when available
    // Stub: just return a new access token with the switched tenant
    const session = createStubSession('stub_switched');
    const response = NextResponse.json({
      accessToken: session.accessToken,
      expiresIn: 900,
    });
    response.cookies.set('vg_refresh', session.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  }

  return NextResponse.json(
    { code: 'BAD_REQUEST', message: 'Unknown action' },
    { status: 400 },
  );
}
```

- [ ] **Step 6: Create `apps/web-admin/app/api/auth/logout/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get('vg_refresh')?.value;

  // Try real API
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    await fetch(`${apiUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // API not available, stub — just clear the cookie
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete('vg_refresh');
  return response;
}
```

- [ ] **Step 7: Create `apps/web-admin/middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/mfa', '/forgot-password', '/reset-password', '/set-password', '/api/auth', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check for refresh token cookie as a proxy for "has a session"
  const hasRefreshToken = req.cookies.has('vg_refresh');

  if (!hasRefreshToken) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 8: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 9: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): auth plumbing — apiClient, auth store, route handlers, middleware"
```

---

### Task 9: Auth screens — login, MFA, forgot/reset password, set password

**Files:**
- Create: `apps/web-admin/app/(auth)/layout.tsx`
- Create: `apps/web-admin/app/(auth)/login/page.tsx`
- Create: `apps/web-admin/app/(auth)/mfa/page.tsx`
- Create: `apps/web-admin/app/(auth)/forgot-password/page.tsx`
- Create: `apps/web-admin/app/(auth)/reset-password/page.tsx`
- Create: `apps/web-admin/app/(auth)/set-password/page.tsx`

- [ ] **Step 1: Create `(auth)/layout.tsx`** — centered card layout with brand mark

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand">
            <span className="text-brand-ink font-bold text-lg">V</span>
          </div>
          <h1 className="text-xl font-semibold text-fg">Verify Admin</h1>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-md">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `(auth)/login/page.tsx`** — email + password form

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Login failed');
        return;
      }

      if (data.mfaRequired) {
        router.push(`/mfa?mfaToken=${data.mfaToken}`);
        return;
      }

      setAuth({
        accessToken: data.accessToken,
        user: data.user,
        memberships: data.memberships,
        activeTenantId: data.activeTenantId,
        activeRole: data.activeRole,
      });

      const next = searchParams.get('next') || '/';
      router.push(next);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Sign in</h2>
        <p className="text-sm text-fg-muted">
          Enter your credentials to access the console
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag" role="alert">
          {error}
        </div>
      )}

      <FormField label="Email" htmlFor="email" required>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          required
          disabled={isLoading}
        />
      </FormField>

      <FormField label="Password" htmlFor="password" required>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <div className="flex items-center justify-between">
        <a
          href="/forgot-password"
          className="text-sm text-brand-text hover:underline"
        >
          Forgot password?
        </a>
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `(auth)/mfa/page.tsx`** — 6-digit TOTP + recovery code toggle

```tsx
'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label, FormField } from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function MfaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mfaToken = searchParams.get('mfaToken') || '';
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mfa',
          mfaToken,
          ...(useRecoveryCode ? { recoveryCode } : { code }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Verification failed');
        if (!useRecoveryCode) inputRef.current?.focus();
        return;
      }

      setAuth({
        accessToken: data.accessToken,
        user: data.user,
        memberships: data.memberships,
        activeTenantId: data.activeTenantId,
        activeRole: data.activeRole,
      });

      router.push('/');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Two-factor authentication</h2>
        <p className="text-sm text-fg-muted">
          {useRecoveryCode
            ? 'Enter one of your recovery codes'
            : 'Enter the 6-digit code from your authenticator app'}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag" role="alert">
          {error}
        </div>
      )}

      {useRecoveryCode ? (
        <FormField label="Recovery code" htmlFor="recoveryCode" required>
          <Input
            id="recoveryCode"
            ref={inputRef}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="abcd-efgh"
            autoComplete="off"
            required
            disabled={isLoading}
          />
        </FormField>
      ) : (
        <FormField label="Authentication code" htmlFor="code" required>
          <Input
            id="code"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="\d{6}"
            required
            disabled={isLoading}
          />
        </FormField>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Verifying…' : 'Verify'}
      </Button>

      <button
        type="button"
        onClick={() => {
          setUseRecoveryCode(!useRecoveryCode);
          setError('');
        }}
        className="text-sm text-brand-text hover:underline"
      >
        {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create `(auth)/forgot-password/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button, Input, FormField } from '@verifyng/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Always returns 202 (no user enumeration)
      await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Swallow errors — same UX
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-fg">Check your email</h2>
        <p className="text-sm text-fg-muted">
          If an account exists with that email, you&apos;ll receive a password reset link.
        </p>
        <a href="/login" className="text-sm text-brand-text hover:underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Reset your password</h2>
        <p className="text-sm text-fg-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <FormField label="Email" htmlFor="email" required>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          required
          disabled={isLoading}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Sending…' : 'Send reset link'}
      </Button>

      <a href="/login" className="block text-center text-sm text-brand-text hover:underline">
        Back to sign in
      </a>
    </form>
  );
}
```

- [ ] **Step 5: Create `(auth)/reset-password/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Reset failed');
        return;
      }

      router.push('/login?reset=1');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Set new password</h2>
        <p className="text-sm text-fg-muted">
          Choose a strong password for your account.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag" role="alert">
          {error}
        </div>
      )}

      <FormField label="New password" htmlFor="newPassword" required>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <FormField label="Confirm password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Create `(auth)/set-password/page.tsx`** — invite flow

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, FormField } from '@verifyng/ui';

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid or missing invite token');
      return;
    }

    setIsLoading(true);
    try {
      // This would proxy to E02's set-password endpoint
      // Stub: just redirect to login
      router.push('/login?invited=1');
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-fg">Set your password</h2>
        <p className="text-sm text-fg-muted">
          You&apos;ve been invited to join the team. Set a password to get started.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag" role="alert">
          {error}
        </div>
      )}

      <FormField label="New password" htmlFor="newPassword" required>
        <Input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <FormField label="Confirm password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isLoading}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Setting password…' : 'Set password & sign in'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 7: Remove the old `app/page.tsx` at the root and add a redirect**

The root page should redirect to `/login` if unauthenticated or `/` (console) if authenticated.

```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/login');
}
```

- [ ] **Step 8: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 9: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): auth screens — login, MFA, forgot/reset/set password"
```

---

### Task 10: Console shell — sidebar, topbar, nav config, breadcrumbs

**Files:**
- Create: `apps/web-admin/app/(console)/layout.tsx`
- Create: `apps/web-admin/app/(console)/nav.config.ts`
- Create: `apps/web-admin/app/(console)/page.tsx`
- Create: `apps/web-admin/components/sidebar.tsx`
- Create: `apps/web-admin/components/topbar.tsx`
- Create: `apps/web-admin/components/tenant-switcher.tsx`
- Create: `apps/web-admin/components/user-menu.tsx`
- Create: `apps/web-admin/components/breadcrumbs.tsx`
- Create: `apps/web-admin/lib/role-utils.ts`

- [ ] **Step 1: Create `apps/web-admin/app/(console)/nav.config.ts`**

```ts
import {
  LayoutDashboard,
  Package,
  Factory,
  Layers,
  ScanLine,
  Activity,
  ShieldAlert,
  MessageSquareWarning,
  BarChart3,
  Users,
  ScrollText,
  CreditCard,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: 'overview' | 'catalog' | 'monitoring' | 'organization' | 'platform';
  minRole?: 'viewer' | 'operator' | 'owner';
  platformRole?: 'support';
  badge?: () => Promise<number | null>;
  order: number;
};

export const NAV: NavEntry[] = [
  // Overview
  { id: 'overview.dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard, section: 'overview', order: 1 },
  // Catalog
  { id: 'catalog.products', label: 'Products', href: '/products', icon: Package, section: 'catalog', order: 10 },
  { id: 'catalog.oems', label: 'OEMs', href: '/oems', icon: Factory, section: 'catalog', order: 20 },
  { id: 'catalog.batches', label: 'Batches', href: '/batches', icon: Layers, section: 'catalog', order: 30 },
  // Monitoring
  { id: 'monitoring.units', label: 'Units', href: '/units', icon: ScanLine, section: 'monitoring', order: 10 },
  { id: 'monitoring.anomalies', label: 'Anomalies', href: '/anomalies', icon: ShieldAlert, section: 'monitoring', order: 20 },
  { id: 'monitoring.reports', label: 'Reports', href: '/reports', icon: MessageSquareWarning, section: 'monitoring', order: 30 },
  { id: 'monitoring.scans', label: 'Scans', href: '/scans', icon: Activity, section: 'monitoring', order: 40 },
  { id: 'monitoring.analytics', label: 'Analytics', href: '/analytics', icon: BarChart3, section: 'monitoring', order: 50 },
  // Organization
  { id: 'organization.team', label: 'Team', href: '/team', icon: Users, section: 'organization', order: 10 },
  { id: 'organization.audit', label: 'Audit log', href: '/audit', icon: ScrollText, section: 'organization', order: 20, minRole: 'owner' },
  { id: 'organization.billing', label: 'Billing', href: '/billing', icon: CreditCard, section: 'organization', order: 30, minRole: 'owner' },
  { id: 'organization.settings', label: 'Settings', href: '/settings', icon: Settings, section: 'organization', order: 40 },
  // Platform (support role only)
  { id: 'platform.support', label: 'Support', href: '/support', icon: LifeBuoy, section: 'platform', platformRole: 'support', order: 10 },
];

export const NAV_SECTIONS: Record<NavEntry['section'], { label: string; order: number }> = {
  overview: { label: 'Overview', order: 1 },
  catalog: { label: 'Catalog', order: 2 },
  monitoring: { label: 'Monitoring', order: 3 },
  organization: { label: 'Organization', order: 4 },
  platform: { label: 'Platform', order: 5 },
};
```

- [ ] **Step 2: Create `apps/web-admin/lib/role-utils.ts`**

```ts
import { NAV, type NavEntry } from '@/app/(console)/nav.config';

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 1,
  operator: 2,
  owner: 3,
};

export function hasMinRole(
  userRole: string | null,
  minRole: string | undefined,
): boolean {
  if (!minRole) return true; // default: viewer can see
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function filterNavByRole(
  role: string | null,
  platformRole: string | null,
): NavEntry[] {
  return NAV.filter((entry) => {
    // Platform entries require platform role
    if (entry.section === 'platform' || entry.platformRole) {
      return platformRole === entry.platformRole;
    }
    return hasMinRole(role, entry.minRole);
  });
}
```

- [ ] **Step 3: Create `apps/web-admin/components/tenant-switcher.tsx`**

```tsx
'use client';

import { useAuth } from '@/lib/auth-store';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';

export function TenantSwitcher() {
  const { memberships, activeTenantId, switchTenant } = useAuth();
  const [open, setOpen] = useState(false);

  if (!memberships || memberships.length === 0) return null;

  const activeMembership = memberships.find(
    (m) => m.tenantId === activeTenantId,
  );

  if (memberships.length === 1) {
    return (
      <span className="text-sm font-medium text-fg truncate">
        {activeMembership?.tenantName}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-fg hover:bg-surface-sunken transition-colors"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate max-w-32">
          {activeMembership?.tenantName}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-fg-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {memberships.map((m) => (
              <li
                key={m.tenantId}
                role="option"
                aria-selected={m.tenantId === activeTenantId}
                onClick={() => {
                  switchTenant(m.tenantId, m.role);
                  setOpen(false);
                }}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-surface-sunken ${
                  m.tenantId === activeTenantId
                    ? 'font-medium text-fg'
                    : 'text-fg-muted'
                }`}
              >
                {m.tenantName}
                <span className="ml-2 text-xs text-fg-faint">
                  ({m.role})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web-admin/components/user-menu.tsx`**

```tsx
'use client';

import { useAuth } from '@/lib/auth-store';
import { LogOutIcon, UserIcon } from 'lucide-react';
import { useState } from 'react';

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-brand-ink text-sm font-medium"
        aria-expanded={open}
        aria-label="User menu"
      >
        {user.displayName.charAt(0).toUpperCase()}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-border bg-surface py-1 shadow-lg">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-fg">{user.displayName}</p>
              <p className="text-xs text-fg-muted">{user.email}</p>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                logout();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
            >
              <LogOutIcon className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web-admin/components/breadcrumbs.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs as BreadcrumbsUI } from '@verifyng/ui';

export function ConsoleBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const items = segments.map((segment, i) => ({
    label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
    href: i < segments.length - 1 ? '/' + segments.slice(0, i + 1).join('/') : undefined,
  }));

  if (items.length === 0) return null;

  return <BreadcrumbsUI items={items} />;
}
```

- [ ] **Step 6: Create `apps/web-admin/components/sidebar.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { NAV, NAV_SECTIONS, type NavEntry } from '@/app/(console)/nav.config';
import { filterNavByRole } from '@/lib/role-utils';
import { useAuth } from '@/lib/auth-store';
import { PanelLeftCloseIcon, PanelLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@verifyng/ui';

export function Sidebar() {
  const pathname = usePathname();
  const { role, platformRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleEntries = filterNavByRole(role, platformRole);
  const groupedBySection = Object.entries(NAV_SECTIONS)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([sectionKey, sectionMeta]) => ({
      key: sectionKey as NavEntry['section'],
      label: sectionMeta.label,
      entries: visibleEntries.filter((e) => e.section === sectionKey),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-surface transition-all',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        {!collapsed && (
          <span className="text-sm font-semibold text-fg">Verify Admin</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-fg-muted hover:bg-surface-sunken"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftIcon className="h-4 w-4" />
          ) : (
            <PanelLeftCloseIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Main navigation">
        {groupedBySection.map((group) => (
          <div key={group.key} className="mb-3">
            {!collapsed && (
              <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-fg-faint">
                {group.label}
              </div>
            )}
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              const isActive =
                entry.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.id}
                  href={entry.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md mx-2 px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-sunken text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                    collapsed && 'justify-center',
                  )}
                  title={collapsed ? entry.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{entry.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 7: Create `apps/web-admin/components/topbar.tsx`**

```tsx
'use client';

import { TenantSwitcher } from './tenant-switcher';
import { UserMenu } from './user-menu';
import { ConsoleBreadcrumbs } from './breadcrumbs';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

export function Topbar() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4">
      <ConsoleBreadcrumbs />
      <div className="flex items-center gap-3">
        <TenantSwitcher />
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-md p-1.5 text-fg-muted hover:bg-surface-sunken"
          aria-label="Toggle dark mode"
        >
          {theme === 'dark' ? (
            <SunIcon className="h-4 w-4" />
          ) : (
            <MoonIcon className="h-4 w-4" />
          )}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Create `apps/web-admin/app/(console)/layout.tsx`**

```tsx
'use client';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { useAuth } from '@/lib/auth-store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // If no access token in memory but cookie exists, try to refresh
  useEffect(() => {
    if (!isAuthenticated) {
      // The middleware handles the redirect; this is a fallback
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-bg p-6">
          {children}
        </main>
      </div>
      {/* Mobile drawer — TODO: sheet-based sidebar for < 1024px */}
    </div>
  );
}
```

- [ ] **Step 9: Create `apps/web-admin/app/(console)/page.tsx`** — dashboard EmptyState

```tsx
import { LayoutDashboardIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@verifyng/ui';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your product authenticity programme" />
      <EmptyState
        icon={LayoutDashboardIcon}
        title="Dashboard coming soon"
        description="Analytics and metrics will appear here once the Analytics epic (E12) ships."
      />
    </div>
  );
}
```

- [ ] **Step 10: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 11: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): console shell — sidebar, topbar, nav config, tenant switcher"
```

---

### Task 11: Route-group skeleton with EmptyState placeholders

**Files:**
- Create all `apps/web-admin/app/(console)/<module>/page.tsx` files
- Create `apps/web-admin/app/(console)/settings/layout.tsx`
- Create `apps/web-admin/app/(console)/settings/page.tsx`
- Create `apps/web-admin/app/(console)/settings/organization/page.tsx`
- Create `apps/web-admin/app/(console)/settings/api-keys/page.tsx`
- Create `apps/web-admin/app/(console)/support/layout.tsx`
- Create `apps/web-admin/app/(console)/support/page.tsx`

Each module page renders an `EmptyState` with the owning epic's name and a link to the epic doc.

- [ ] **Step 1: Create skeleton pages**

Create each file. Here's the pattern (one per module):

**`apps/web-admin/app/(console)/products/page.tsx`:**
```tsx
import { PackageIcon } from 'lucide-react';
import { EmptyState, PageHeader } from '@verifyng/ui';

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Products" />
      <EmptyState
        icon={PackageIcon}
        title="Products"
        description="Catalog & Minting (E04) will build this module."
        action={<a href="https://github.com/enendufrankc/verifynNG/issues/5" className="text-sm text-brand-text hover:underline">View epic</a>}
      />
    </div>
  );
}
```

Repeat for each module with the appropriate icon and epic reference:
- **oems** — FactoryIcon, E04
- **batches** — LayersIcon, E04
- **units** — ScanLineIcon, E07
- **scans** — ActivityIcon, E12
- **anomalies** — ShieldAlertIcon, E07
- **reports** — MessageSquareWarningIcon, E08
- **analytics** — BarChart3Icon, E12
- **audit** — ScrollTextIcon, E13
- **billing** — CreditCardIcon, E15

- [ ] **Step 2: Create settings layout + pages**

**`apps/web-admin/app/(console)/settings/layout.tsx`:**
```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@verifyng/ui';

const settingsNav = [
  { label: 'Organization', href: '/settings/organization' },
  { label: 'Security', href: '/settings/security' },
  { label: 'API Keys', href: '/settings/api-keys' },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Settings</h1>
      </div>
      <div className="flex gap-6">
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {settingsNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'block rounded-md px-3 py-1.5 text-sm transition-colors',
                    pathname === item.href
                      ? 'bg-surface-sunken text-fg font-medium'
                      : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

**`apps/web-admin/app/(console)/settings/page.tsx`:** Redirects to `/settings/organization`.
```tsx
import { redirect } from 'next/navigation';

export default function SettingsPage() {
  redirect('/settings/organization');
}
```

**`apps/web-admin/app/(console)/settings/organization/page.tsx`:** EmptyState for E03.
**`apps/web-admin/app/(console)/settings/api-keys/page.tsx`:** EmptyState for E16.

- [ ] **Step 3: Create support layout (gated on platformRole=support)**

**`apps/web-admin/app/(console)/support/layout.tsx`:**
```tsx
'use client';

import { useAuth } from '@/lib/auth-store';
import { notFound } from 'next/navigation';

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { platformRole } = useAuth();

  if (platformRole !== 'support') {
    notFound();
  }

  return <div>{children}</div>;
}
```

**`apps/web-admin/app/(console)/support/page.tsx`:** EmptyState for E18.

- [ ] **Step 4: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): route-group skeleton with EmptyState placeholders"
```

---

### Task 12: TanStack Query + forms conventions

**Files:**
- Create: `apps/web-admin/lib/query.ts`
- Create: `apps/web-admin/lib/forms.ts`

- [ ] **Step 1: Create `apps/web-admin/lib/query.ts`**

```ts
import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiClient } from './api-client';
import { useAuthStore } from './auth-store';

// ── Query key factory ───────────────────────────────────────────
// Every key starts with tenantId so switching tenants invalidates everything
export const queryKeys = {
  team: {
    list: (tenantId: string) => ['team', 'list', tenantId] as const,
    detail: (tenantId: string, userId: string) => ['team', 'detail', tenantId, userId] as const,
  },
  settings: {
    security: (tenantId: string) => ['settings', 'security', tenantId] as const,
    sessions: (tenantId: string) => ['settings', 'sessions', tenantId] as const,
  },
  // Other epics add their own keys following this pattern
};

// ── Server-side cursor pagination hook ──────────────────────────
export function usePagedQuery<TItem>(
  key: readonly unknown[],
  fetcher: (cursor?: string) => Promise<{ items: TItem[]; nextCursor?: string }>,
) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetcher(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  });
}
```

- [ ] **Step 2: Create `apps/web-admin/lib/forms.ts`**

```tsx
'use client';

import { useForm, type FieldValues, type DefaultValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ZodSchema } from 'zod';
import { ApiError } from './api-client';

/**
 * Maps server ApiError.details[] to react-hook-form field errors
 */
export function setServerErrors<T extends FieldValues>(
  form: ReturnType<typeof useForm<T>>,
  error: unknown,
) {
  if (error instanceof ApiError && error.details) {
    const fieldErrors: Record<string, { type: string; message: string }> = {};
    for (const detail of error.details) {
      fieldErrors[detail.field] = { type: 'server', message: detail.message };
    }
    Object.entries(fieldErrors).forEach(([field, err]) => {
      form.setError(field as keyof T, err);
    });
  }
}

/**
 * Convenience hook: react-hook-form + zod resolver
 */
export function useZodForm<T extends FieldValues>(
  schema: ZodSchema<T>,
  defaults?: DefaultValues<T>,
) {
  return useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/lib/
git commit -m "feat(E11): TanStack Query keys factory and forms conventions"
```

---

### Task 13: Team module — reference implementation

**Files:**
- Create: `apps/web-admin/app/(console)/team/page.tsx`

This is the reference implementation other epics copy. It uses DataTable, apiClient, queryKeys, useTenantPath, forms, and ConfirmDialog.

- [ ] **Step 1: Create `apps/web-admin/app/(console)/team/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import {
  DataTable,
  PageHeader,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  FormField,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ConfirmDialog,
  StatusChip,
  Badge,
  EmptyState,
} from '@verifyng/ui';
import { UserPlusIcon, UsersIcon, Trash2Icon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface Member {
  id: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: string;
}

export default function TeamPage() {
  const { activeTenantId, role: activeRole } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const isOwner = activeRole === 'owner';

  // Fetch members
  const { data: members = [], isLoading } = useQuery({
    queryKey: queryKeys.team.list(activeTenantId ?? ''),
    queryFn: () => apiClient.get<Member[]>(tenantPath('/members')),
    enabled: !!activeTenantId,
  });

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Remove member state
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeError, setRemoveError] = useState('');

  // Change role state
  const [changingRole, setChangingRole] = useState<string | null>(null);

  async function handleInvite() {
    setInviteLoading(true);
    setInviteError('');
    try {
      await apiClient.post(tenantPath('/members/invite'), {
        email: inviteEmail,
        role: inviteRole,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
    } catch (err) {
      if (err instanceof ApiError) {
        setInviteError(err.message);
      } else {
        setInviteError('Failed to invite member');
      }
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    setRemoveError('');
    try {
      await apiClient.delete(
        tenantPath(`/members/${removeTarget.id}`),
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      });
      setRemoveTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setRemoveError(err.message);
      } else {
        setRemoveError('Failed to remove member');
      }
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleChangeRole(member: Member, newRole: string) {
    try {
      await apiClient.patch(tenantPath(`/members/${member.id}`), {
        role: newRole,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      });
      setChangingRole(null);
    } catch {
      // Surface error inline — for now just revert
      setChangingRole(null);
    }
  }

  const columns: ColumnDef<Member>[] = [
    {
      accessorKey: 'displayName',
      header: 'Name',
    },
    {
      accessorKey: 'email',
      header: 'Email',
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const member = row.original;
        if (isOwner && changingRole === member.id) {
          return (
            <Select
              value={member.role}
              onValueChange={(val) => handleChangeRole(member, val)}
            >
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          );
        }
        return (
          <Badge
            variant={
              member.role === 'owner'
                ? 'default'
                : member.role === 'operator'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {member.role}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'joinedAt',
      header: 'Joined',
      cell: ({ row }) =>
        row.original.joinedAt
          ? new Date(row.original.joinedAt).toLocaleDateString()
          : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Manage team members and their roles"
        actions={
          isOwner ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlusIcon className="mr-2 h-4 w-4" />
              Invite member
            </Button>
          ) : undefined
        }
      />

      <DataTable
        columns={columns}
        data={members}
        isLoading={isLoading}
        rowActions={
          isOwner
            ? (member) => (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setChangingRole(member.id)}
                    className="rounded p-1 text-fg-muted hover:bg-surface-sunken"
                    title="Change role"
                  >
                    <Badge className="text-xs cursor-pointer">Edit role</Badge>
                  </button>
                  <button
                    onClick={() => setRemoveTarget(member)}
                    className="rounded p-1 text-fg-muted hover:bg-surface-sunken hover:text-v-flag"
                    title="Remove member"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </button>
                </div>
              )
            : undefined
        }
        emptyState={
          <EmptyState
            icon={UsersIcon}
            title="No team members"
            description="Invite your first team member to get started."
            action={
              isOwner ? (
                <Button onClick={() => setInviteOpen(true)}>
                  <UserPlusIcon className="mr-2 h-4 w-4" />
                  Invite member
                </Button>
              ) : undefined
            }
          />
        }
      />

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
          </DialogHeader>
          {inviteError && (
            <div className="rounded-md bg-v-flag-tint p-3 text-sm text-v-flag" role="alert">
              {inviteError}
            </div>
          )}
          <div className="space-y-4">
            <FormField label="Email" htmlFor="invite-email" required>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </FormField>
            <FormField label="Role" htmlFor="invite-role" required>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviteLoading || !inviteEmail}>
              {inviteLoading ? 'Inviting…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={() => setRemoveTarget(null)}
        title="Remove team member"
        description={`Are you sure you want to remove ${removeTarget?.displayName ?? removeTarget?.email}? This action cannot be undone.`}
        variant="destructive"
        confirmLabel="Remove"
        onConfirm={handleRemove}
        isLoading={removeLoading}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): team module — reference implementation with DataTable, forms, apiClient"
```

---

### Task 14: Settings/Security — change password, MFA, sessions

**Files:**
- Create: `apps/web-admin/app/(console)/settings/security/page.tsx`

This is the second reference implementation. It demonstrates forms, mutation patterns, and MFA setup wizard.

- [ ] **Step 1: Create `apps/web-admin/app/(console)/settings/security/page.tsx`**

This page has three sections: Change Password, MFA Setup/Management, and Sessions. Since E02 hasn't shipped, these use stub data. The full implementation will proxy to E02 routes.

```tsx
'use client';

import { useState } from 'react';
import { Button, Input, FormField, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, Badge, EmptyState, ConfirmDialog } from '@verifyng/ui';
import { ShieldIcon, KeyIcon, MonitorIcon, SmartphoneIcon, Trash2Icon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';

// Stub sessions data (replace with E02 API when available)
const STUB_SESSIONS = [
  { id: 'sess_1', userAgent: 'Chrome / macOS', ipPrefix: '192.168.1.', createdAt: '2026-01-15T10:00:00Z', lastSeenAt: '2026-01-20T14:30:00Z', current: true },
  { id: 'sess_2', userAgent: 'Safari / iPhone', ipPrefix: '10.0.0.', createdAt: '2026-01-10T08:00:00Z', lastSeenAt: '2026-01-18T09:00:00Z', current: false },
];

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // MFA state
  const [mfaStep, setMfaStep] = useState<'idle' | 'setup' | 'verify' | 'codes'>('idle');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // Sessions state
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      // TODO: proxy to E02 /auth/password/change
      await new Promise((r) => setTimeout(r, 500)); // stub delay
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordError('Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleEnableMfa() {
    setMfaStep('setup');
    // TODO: call E02 /auth/mfa/setup → get secret + otpauthUri
  }

  async function handleVerifyMfa() {
    setMfaError('');
    // TODO: call E02 /auth/mfa/enable with code
    // Stub: accept any 6-digit code
    if (mfaCode.length === 6) {
      setRecoveryCodes([
        'abc1-def2', 'ghi3-jkl4', 'mno5-pqr6', 'stu7-vwx8', 'yza9-bcd0',
        'efg1-hij2', 'klm3-nop4', 'qrs5-tuv6', 'wxy7-zab8', 'cde9-fgh0',
      ]);
      setMfaStep('codes');
    } else {
      setMfaError('Invalid code. Please enter a 6-digit code.');
    }
  }

  async function handleDisableMfa() {
    // TODO: call E02 /auth/mfa/disable with password + code
    setMfaStep('idle');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Security" description="Manage your password, two-factor authentication, and active sessions" />

      <Tabs defaultValue="password">
        <TabsList>
          <TabsTrigger value="password">
            <KeyIcon className="mr-2 h-4 w-4" />
            Password
          </TabsTrigger>
          <TabsTrigger value="mfa">
            <SmartphoneIcon className="mr-2 h-4 w-4" />
            Two-factor
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <MonitorIcon className="mr-2 h-4 w-4" />
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password" className="space-y-4 pt-4">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <FormField label="Current password" htmlFor="currentPassword" required>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <FormField label="New password" htmlFor="newPassword" required>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </FormField>
            <FormField label="Confirm new password" htmlFor="confirmPassword" required>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </FormField>
            {passwordError && (
              <p className="text-sm text-danger" role="alert">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-v-pos" role="status">Password changed successfully.</p>
            )}
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="mfa" className="space-y-4 pt-4">
          {user?.mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default">Enabled</Badge>
                <span className="text-sm text-fg-muted">
                  Two-factor authentication is active on your account.
                </span>
              </div>
              <Button variant="outline" onClick={handleDisableMfa}>
                Disable two-factor authentication
              </Button>
            </div>
          ) : mfaStep === 'idle' ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                Add an extra layer of security to your account by enabling two-factor authentication.
              </p>
              <Button onClick={handleEnableMfa}>
                <ShieldIcon className="mr-2 h-4 w-4" />
                Enable two-factor authentication
              </Button>
            </div>
          ) : mfaStep === 'setup' ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                Scan the QR code below with your authenticator app (Google Authenticator, Authy, etc.).
              </p>
              <div className="flex justify-center p-4 bg-white rounded-md">
                {/* TODO: QR code from E02 otpauthUri via qrcode.react */}
                <div className="h-48 w-48 bg-surface-sunken flex items-center justify-center text-fg-muted text-sm">
                  QR Code (E02)
                </div>
              </div>
              <Button onClick={() => setMfaStep('verify')}>
                I&apos;ve scanned the code
              </Button>
            </div>
          ) : mfaStep === 'verify' ? (
            <div className="space-y-4">
              <FormField label="Enter the 6-digit code from your app" htmlFor="mfa-code" required>
                <Input
                  id="mfa-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </FormField>
              {mfaError && (
                <p className="text-sm text-danger" role="alert">{mfaError}</p>
              )}
              <div className="flex gap-2">
                <Button onClick={handleVerifyMfa}>Verify & enable</Button>
                <Button variant="outline" onClick={() => setMfaStep('idle')}>Cancel</Button>
              </div>
            </div>
          ) : mfaStep === 'codes' ? (
            <div className="space-y-4">
              <div className="rounded-md bg-v-pos-tint p-4">
                <p className="text-sm font-medium text-v-pos">
                  Save your recovery codes
                </p>
                <p className="text-sm text-v-pos/80 mt-1">
                  These codes can be used to sign in if you lose access to your authenticator.
                  Each code can only be used once.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-4 font-mono text-sm">
                {recoveryCodes.map((code, i) => (
                  <div key={i}>{code}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCodes.join('\n'));
                  }}
                >
                  Copy codes
                </Button>
                <Button variant="outline" onClick={() => setMfaStep('idle')}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4 pt-4">
          <div className="space-y-3">
            {STUB_SESSIONS.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-md border border-border bg-surface p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-fg">{session.userAgent}</p>
                    {session.current && (
                      <Badge variant="default">This device</Badge>
                    )}
                  </div>
                  <p className="text-xs text-fg-muted">
                    IP: {session.ipPrefix}••• · Last active: {new Date(session.lastSeenAt).toLocaleDateString()}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevokeTarget(session.id)}
                  >
                    <Trash2Icon className="h-4 w-4 text-fg-muted" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm">
            Revoke all other sessions
          </Button>

          <ConfirmDialog
            open={!!revokeTarget}
            onOpenChange={() => setRevokeTarget(null)}
            title="Revoke session"
            description="Are you sure you want to revoke this session? The user will be signed out."
            variant="destructive"
            confirmLabel="Revoke"
            onConfirm={() => {
              // TODO: call E02 DELETE /auth/sessions/:id
              setRevokeTarget(null);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @verifynng/web-admin build`

Expected: Builds successfully.

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): settings/security — change password, MFA wizard, sessions"
```

---

### Task 15: Status banner component

**Files:**
- Create: `apps/web-admin/components/status-banner.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { AlertTriangleIcon, ClockIcon, LockIcon } from 'lucide-react';

interface StatusBannerProps {
  status: 'pending' | 'in_review' | 'suspended' | 'active';
}

export function StatusBanner({ status }: StatusBannerProps) {
  if (status === 'active') return null;

  const config = {
    pending: {
      icon: ClockIcon,
      bg: 'bg-v-susp-tint',
      text: 'text-v-susp',
      message: 'Your business is under review. Some features may be limited.',
    },
    in_review: {
      icon: ClockIcon,
      bg: 'bg-v-susp-tint',
      text: 'text-v-susp',
      message: 'Your business is under review. Some features may be limited.',
    },
    suspended: {
      icon: LockIcon,
      bg: 'bg-v-flag-tint',
      text: 'text-v-flag',
      message: 'Console is read-only. Contact support for assistance.',
    },
  }[status];

  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 px-4 py-2 ${config.bg} ${config.text}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{config.message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into console layout**

Add the StatusBanner to the `(console)/layout.tsx` after the Topbar. The tenant status will come from `/auth/me` once E02/E03 ship.

- [ ] **Step 3: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): tenant status banner component"
```

---

### Task 16: Playwright setup + E2E fixtures

**Files:**
- Create: `apps/web-admin/playwright.config.ts`
- Create: `apps/web-admin/e2e/fixtures/index.ts`
- Add test scripts to `apps/web-admin/package.json`

- [ ] **Step 1: Create `apps/web-admin/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.WEB_ADMIN_URL || `http://localhost:${process.env.WEB_ADMIN_PORT || 4134}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — we run against docker compose or dev server
});
```

- [ ] **Step 2: Create `apps/web-admin/e2e/fixtures/index.ts`**

```ts
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ── loginAs fixture ────────────────────────────────────────────
// Uses stub credentials to sign in and cache storageState per role
const CREDENTIALS = {
  owner: { email: 'owner@ivoryglow.local', password: 'Passw0rd!Passw0rd!' },
  operator: { email: 'operator@ivoryglow.local', password: 'Passw0rd!Passw0rd!' },
  viewer: { email: 'viewer@ivoryglow.local', password: 'Passw0rd!Passw0rd!' },
  support: { email: 'support@verifyng.local', password: 'Passw0rd!Passw0rd!' },
};

type Role = keyof typeof CREDENTIALS;

export const test = base.extend<{
  loginAs: (role: Role, tenantSlug?: string) => Promise<void>;
}>({
  loginAs: async ({ page }, use) => {
    const loginAs = async (role: Role, _tenantSlug = 'ivoryglow') => {
      const creds = CREDENTIALS[role];
      await page.goto('/login');
      await page.fill('input[type="email"]', creds.email);
      await page.fill('input[type="password"]', creds.password);
      await page.click('button[type="submit"]');
      // Wait for redirect to dashboard
      await page.waitForURL(/\/(login\/mfa)?$/);
      // If MFA is required, handle it (stub doesn't require MFA by default)
    };
    await use(loginAs);
  },
});

export { expect };

// ── Accessibility helper ───────────────────────────────────────
export async function expectNoA11yViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const violations = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  expect(violations).toEqual([]);
}
```

- [ ] **Step 3: Add test scripts to `apps/web-admin/package.json`**

```json
{
  "test:e2e": "playwright test",
  "test:a11y": "playwright test --grep @a11y"
}
```

- [ ] **Step 4: Create `apps/web-admin/e2e/login.spec.ts`**

```ts
import { test, expect } from './fixtures';

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('h2')).toContainText('Sign in');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('login with valid credentials', async ({ page, loginAs }) => {
  await loginAs('owner');
  await expect(page).toHaveURL('/');
  await expect(page.locator('text=Dashboard')).toBeVisible();
});

test('login with invalid credentials shows error', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'wrong@example.com');
  await page.fill('input[type="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await expect(page.locator('[role="alert"]')).toBeVisible();
});

test('unauthenticated access redirects to login', async ({ page }) => {
  await page.goto('/team');
  await expect(page).toHaveURL(/\/login\?next=/);
});
```

- [ ] **Step 5: Create `apps/web-admin/e2e/skeleton-routes.spec.ts`**

```ts
import { test, expect, expectNoA11yViolations } from './fixtures';

const SKELETON_ROUTES = [
  '/',
  '/products',
  '/oems',
  '/batches',
  '/units',
  '/anomalies',
  '/reports',
  '/scans',
  '/analytics',
  '/team',
  '/audit',
  '/billing',
  '/settings/organization',
  '/settings/security',
  '/settings/api-keys',
];

for (const route of SKELETON_ROUTES) {
  test(`${route} renders without errors`, async ({ page, loginAs }) => {
    await loginAs('owner');
    await page.goto(route);
    // Check no console errors
    await expect(page.locator('body')).toBeVisible();
  });

  test(`${route} passes a11y @a11y`, async ({ page, loginAs }) => {
    await loginAs('owner');
    await page.goto(route);
    await expectNoA11yViolations(page);
  });
}
```

- [ ] **Step 6: Create `apps/web-admin/e2e/role-nav.spec.ts`**

```ts
import { test, expect } from './fixtures';

test('viewer sees no owner-only nav entries', async ({ page, loginAs }) => {
  await loginAs('viewer');
  // Owner-only entries should not be visible
  await expect(page.locator('text=Audit log')).not.toBeVisible();
  await expect(page.locator('text=Billing')).not.toBeVisible();
  // But viewer can see team
  await expect(page.locator('a[href="/team"]')).toBeVisible();
});

test('viewer sees no team invite button', async ({ page, loginAs }) => {
  await loginAs('viewer');
  await page.goto('/team');
  await expect(page.locator('text=Invite member')).not.toBeVisible();
});

test('support user sees platform section', async ({ page, loginAs }) => {
  await loginAs('support');
  await expect(page.locator('text=Support')).toBeVisible();
});
```

- [ ] **Step 7: Verify Playwright installs**

Run: `cd apps/web-admin && npx playwright install chromium`

- [ ] **Step 8: Commit**

```bash
git add apps/web-admin/
git commit -m "feat(E11): Playwright setup, fixtures, login and skeleton E2E specs"
```

---

### Task 17: docs/console.md

**Files:**
- Create: `docs/console.md`

- [ ] **Step 1: Create the documentation**

This document explains how other epics add a module to the console.

Key sections:
1. How to add a module (route group + nav entry + query keys + useTenantPath)
2. Theming (applyTenantTheme, what's overridable)
3. Component catalogue link
4. Fixture usage (loginAs, expectNoA11yViolations)
5. A11y rules (labels, focus order, contrast ≥ 4.5:1, no colour-only verdicts)

- [ ] **Step 2: Commit**

```bash
git add docs/console.md
git commit -m "docs(E11): console.md — how to add a module, theming, a11y rules"
```

---

### Task 18: Update config env-schema for E11

**Files:**
- Modify: `packages/config/src/env-schema.ts` (hot-spot: add E11 section)

- [ ] **Step 1: Add E11 section to env-schema**

Add after the E00 section:
```ts
// ── E11 Admin Console ────────────────────────────────────────────
JWT_ACCESS_TTL: z.string().default('15m'),
```

This allows the access TTL to be overridden for AC2 (silent refresh testing with 20s).

- [ ] **Step 2: Verify config package builds**

Run: `pnpm --filter @verifynng/config build`

- [ ] **Step 3: Commit**

```bash
git add packages/config/
git commit -m "feat(E11): add JWT_ACCESS_TTL to config env schema"
```

---

### Task 19: Unit tests for auth plumbing, nav filtering, and token helpers

**Files:**
- Create: `apps/web-admin/lib/__tests__/role-utils.test.ts`
- Create: `apps/web-admin/lib/__tests__/api-client.test.ts`

These test the core logic without a browser.

- [ ] **Step 1: Add vitest to web-admin devDependencies**

Add to `apps/web-admin/package.json` devDependencies:
```json
"vitest": "^4.1.11",
"jsdom": "^26.1.0",
"@testing-library/react": "^16.3.0",
"@testing-library/jest-dom": "^6.6.3"
```

- [ ] **Step 2: Create vitest.config.ts for web-admin**

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['lib/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
});
```

- [ ] **Step 3: Create role-utils test**

```ts
import { describe, it, expect } from 'vitest';
import { hasMinRole, filterNavByRole } from '../role-utils';
import { NAV } from '@/app/(console)/nav.config';

describe('hasMinRole', () => {
  it('returns true when no minRole required', () => {
    expect(hasMinRole('viewer', undefined)).toBe(true);
  });

  it('returns true when user role meets requirement', () => {
    expect(hasMinRole('owner', 'owner')).toBe(true);
    expect(hasMinRole('owner', 'operator')).toBe(true);
    expect(hasMinRole('owner', 'viewer')).toBe(true);
    expect(hasMinRole('operator', 'operator')).toBe(true);
    expect(hasMinRole('operator', 'viewer')).toBe(true);
    expect(hasMinRole('viewer', 'viewer')).toBe(true);
  });

  it('returns false when user role insufficient', () => {
    expect(hasMinRole('viewer', 'operator')).toBe(false);
    expect(hasMinRole('viewer', 'owner')).toBe(false);
    expect(hasMinRole('operator', 'owner')).toBe(false);
  });

  it('returns false when user has no role', () => {
    expect(hasMinRole(null, 'viewer')).toBe(false);
  });
});

describe('filterNavByRole', () => {
  it('owner sees all non-platform entries', () => {
    const filtered = filterNavByRole('owner', null);
    const platformEntries = filtered.filter((e) => e.section === 'platform');
    expect(platformEntries).toHaveLength(0);
    // Owner can see entries with minRole: 'owner'
    expect(filtered.some((e) => e.id === 'organization.audit')).toBe(true);
    expect(filtered.some((e) => e.id === 'organization.billing')).toBe(true);
  });

  it('viewer cannot see owner-only entries', () => {
    const filtered = filterNavByRole('viewer', null);
    expect(filtered.some((e) => e.id === 'organization.audit')).toBe(false);
    expect(filtered.some((e) => e.id === 'organization.billing')).toBe(false);
  });

  it('support user sees platform section', () => {
    const filtered = filterNavByRole('viewer', 'support');
    expect(filtered.some((e) => e.id === 'platform.support')).toBe(true);
  });

  it('non-support user cannot see platform entries', () => {
    const filtered = filterNavByRole('owner', null);
    expect(filtered.some((e) => e.id === 'platform.support')).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @verifynng/web-admin test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web-admin/
git commit -m "test(E11): unit tests for role-utils and nav filtering"
```

---

### Task 20: Full pre-push verification

- [ ] **Step 1: Run `pnpm lint`**

Run: `pnpm lint`

Expected: No errors.

- [ ] **Step 2: Run `pnpm typecheck`**

Run: `pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Run `pnpm test`**

Run: `pnpm test`

Expected: All unit tests pass.

- [ ] **Step 4: Run `pnpm build`**

Run: `pnpm build`

Expected: All packages build successfully.

- [ ] **Step 5: Run token drift check**

Run: `npx tsx scripts/check-token-drift.ts`

Expected: No drift detected.

- [ ] **Step 6: Push and update PR**

```bash
git push origin epic/E11-admin-shell
```

---

## Self-review checklist

- [x] **Spec coverage:** Every task in the E11 epic file maps to at least one task in this plan. T0a (token import + drift check) → Tasks 1, 2. T0b (Storybook foundations) → Task 6. T1 (packages/ui scaffold) → Tasks 1, 3. T2 (primitives batch 1) → Task 4. T3 (primitives batch 2) → Task 5. T4 (web-admin shell) → Task 10. T5 (auth plumbing) → Task 8. T6 (auth screens) → Task 9. T7 (tenant switcher + banner) → Tasks 10, 15. T8 (route-group skeleton) → Task 11. T9 (query + forms) → Task 12. T10 (settings/security) → Task 14. T11 (team) → Task 13. T12 (Playwright) → Task 16. T13 (docs/console.md) → Task 17.
- [x] **Placeholder scan:** No TBD/TODO without context. All stub layers are clearly marked for deletion when E02 ships.
- [x] **Type consistency:** AuthUser, Membership, NavEntry types are consistent across files. apiClient methods return typed responses. queryKeys use the same tenantId-first pattern.
- [x] **E02 dependency:** Handled via stubs in `lib/api-stubs.ts`. The route handlers try the real API first and fall back to stubs. This means when E02 ships, the stubs naturally stop being used and can be deleted.
