# Verify UI Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the landing page's restrained, product-owner-focused visual language through authentication, the tenant console shell, and the Products/Batches workflow.

**Architecture:** Keep domain behaviour and API contracts unchanged. Strengthen the existing token and shared-component layer in `packages/ui`, then apply those primitives to the existing admin routes. Tenant verdict colours and tenant branding remain platform contracts; only surrounding layout, type, controls, and state presentation are refreshed.

**Tech Stack:** Next.js App Router, React, Tailwind CSS v4, `@verifyng/ui`, React Query, React Hook Form, Playwright, Vitest.

---

### Task 1: Capture the visual contract in design documentation

**Files:**
- Create: `docs/design/2026-09-10-console-ui-refresh.md`
- Reference: `docs/design/2026-09-09-platform-landing.md`
- Reference: `packages/ui/src/tokens.css`

- [ ] **Step 1: Write the design contract**

Document the shared canvas, ink, turquoise action, spacing, radius, shadow, typography, focus, and responsive rules. Include three reference states: an auth form, a data-table page, and a batch creation form. Explicitly state that verdict colours and tenant theme overrides are unchanged.

- [ ] **Step 2: Review the contract against existing tokens**

Run `rg -n "--color-|--spacing-|--radius-|--shadow-|--font-" packages/ui/src/tokens.css` and ensure every value named in the document already exists or is identified as a deliberate token addition.

- [ ] **Step 3: Commit the design contract**

Run `git add docs/design/2026-09-10-console-ui-refresh.md && git commit -m "docs(E11): define console visual refresh"`.

### Task 2: Refine shared UI primitives without changing their public API

**Files:**
- Modify: `packages/ui/src/tokens.css`
- Modify: `packages/ui/src/components/ui/button.tsx`
- Modify: `packages/ui/src/components/ui/input.tsx`
- Modify: `packages/ui/src/components/ui/data-table.tsx`
- Modify: `packages/ui/src/components/ui/page-header.tsx`
- Modify: `packages/ui/src/components/ui/empty-state.tsx`
- Test: existing `packages/ui/src/**/*.test.ts` plus focused component tests where behaviour changes.

- [ ] **Step 1: Add failing assertions for the shared states**

Cover focus visibility, disabled action styling, compact/large button geometry, table loading and empty states, and page-header action alignment. Keep tests behavioural: render the component, inspect accessible names/roles, and assert state-specific classes only where the class is the public visual contract.

- [ ] **Step 2: Run the focused UI tests and confirm failure**

Run `pnpm --filter @verifyng/ui test -- --runInBand` and record the failing assertions before implementation.

- [ ] **Step 3: Implement the minimum token and primitive changes**

Use the existing semantic aliases and `cn` helper. Preserve exported component names, props, and tenant-theme CSS variables. Do not introduce route-specific colours or inline style values.

- [ ] **Step 4: Run focused tests and typecheck**

Run `pnpm --filter @verifyng/ui test -- --runInBand && pnpm typecheck`. Expected result: all UI tests and type checks pass.

- [ ] **Step 5: Commit the shared foundation**

Run `git add packages/ui && git commit -m "feat(E11): refine shared console primitives"`.

### Task 3: Refresh auth and onboarding presentation while preserving auth behaviour

**Files:**
- Modify: `apps/web-admin/app/(auth)/layout.tsx`
- Modify: `apps/web-admin/app/(auth)/login/page.tsx`
- Modify: `apps/web-admin/app/(auth)/forgot-password/page.tsx`
- Modify: `apps/web-admin/app/(auth)/reset-password/page.tsx`
- Modify: `apps/web-admin/app/(onboarding)/signup/page.tsx`
- Test: `tests/e2e/auth-ui.spec.ts` (create if absent)

- [ ] **Step 1: Add Playwright coverage for the visual and functional contract**

Assert that login exposes organisation, email, password, SSO and forgot-password controls; signup exposes its current step and accessible progress; invalid submissions show the existing error text; successful navigation targets remain unchanged.

- [ ] **Step 2: Run the auth tests before styling**

Run `pnpm exec playwright test tests/e2e/auth-ui.spec.ts --project=chromium`. The baseline must pass or any existing failure must be recorded before edits.

- [ ] **Step 3: Apply the shared visual language**

Use `@verifyng/ui` primitives and semantic classes for the auth card, step header, progress indicator, document upload rows, policy controls, and action footer. Replace hard-coded slate/amber/white values and ad-hoc rounded geometry. Keep the API requests, headers, step transitions, and error handling intact.

- [ ] **Step 4: Run auth tests and accessibility checks**

Run the focused Playwright test plus the existing axe checks. Expected result: the auth flow still completes and no new critical or serious accessibility violations appear.

- [ ] **Step 5: Commit the auth refresh**

Run `git add apps/web-admin/app/(auth) apps/web-admin/app/(onboarding) tests/e2e/auth-ui.spec.ts && git commit -m "feat(E11): refresh auth and onboarding surfaces"`.

### Task 4: Refresh the console shell and navigation

**Files:**
- Modify: `apps/web-admin/app/(console)/layout.tsx`
- Modify: `apps/web-admin/components/sidebar.tsx`
- Modify: `apps/web-admin/components/topbar.tsx`
- Modify: `apps/web-admin/components/status-banner.tsx`
- Modify: `apps/web-admin/app/globals.css`
- Test: `tests/e2e/console-shell-ui.spec.ts` (create if absent)

- [ ] **Step 1: Add shell regression coverage**

Assert desktop and mobile navigation, tenant switching, restricted-subscription banner, keyboard focus, and route preservation. Cover the `lg` breakpoint and ensure the main content remains scrollable.

- [ ] **Step 2: Run the shell tests and capture the baseline**

Run `pnpm exec playwright test tests/e2e/console-shell-ui.spec.ts --project=chromium`.

- [ ] **Step 3: Implement the shell refresh**

Use the landing typography and token-driven surfaces for the sidebar, topbar, active navigation marker, mobile sheet, and content padding. Keep the existing nav registry, auth guards, billing query, impersonation banner, and policy guard unchanged.

- [ ] **Step 4: Verify responsive shell behaviour**

Run the shell test at 360px, 768px, and desktop viewport sizes. Expected result: no horizontal overflow, visible focus states, and usable touch targets.

- [ ] **Step 5: Commit the shell**

Run `git add apps/web-admin/app/(console)/layout.tsx apps/web-admin/components apps/web-admin/app/globals.css tests/e2e/console-shell-ui.spec.ts && git commit -m "feat(E11): extend landing language to console shell"`.

### Task 5: Apply the system to Products and Batches

**Files:**
- Modify: `apps/web-admin/app/(console)/products/page.tsx`
- Modify: `apps/web-admin/app/(console)/batches/page.tsx`
- Modify: `apps/web-admin/app/(console)/batches/new/page.tsx`
- Modify: `apps/web-admin/app/(console)/batches/[id]/page.tsx`
- Test: `tests/e2e/product-owner-ui.spec.ts` (create if absent)

- [ ] **Step 1: Add product-owner journey coverage**

Cover loading, empty, error, create, edit, archive, batch creation, and batch detail states. Assert that tenant-scoped route calls and existing success/error messages remain unchanged.

- [ ] **Step 2: Run the journey test before styling**

Run `pnpm exec playwright test tests/e2e/product-owner-ui.spec.ts --project=chromium` and record the baseline.

- [ ] **Step 3: Apply shared page composition**

Use `PageHeader`, `DataTable`, `EmptyState`, `Dialog`, `FormField`, `Input`, `Button`, `Badge`, and semantic tokens. Establish one clear primary action per page, quiet secondary actions, readable table density, and a consistent mobile stack. Preserve all tenant scoping, role checks, validation, and raw-code handling rules.

- [ ] **Step 4: Verify the owner journey at responsive sizes**

Run the journey test at 360px, 768px, and desktop widths. Expected result: no overflow, all actions keyboard reachable, and the create-batch path remains usable on mobile.

- [ ] **Step 5: Commit the product-owner surfaces**

Run `git add apps/web-admin/app/(console)/products apps/web-admin/app/(console)/batches tests/e2e/product-owner-ui.spec.ts && git commit -m "feat(E11): refresh product owner workflow"`.

### Task 6: Run the repository verification gate

**Files:**
- No source changes unless verification reveals a regression.

- [ ] **Step 1: Run the required checks**

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

- [ ] **Step 2: Run UI end-to-end checks against compose**

Start the local stack with `docker compose -f docker/compose.yml up -d`, then run `pnpm test:e2e` using the worktree ports from `.env`.

- [ ] **Step 3: Review screenshots at mobile and desktop widths**

Capture login, signup, Products, and New Batch at 360px and 1440px. Check alignment, overflow, focus rings, and readable density.

- [ ] **Step 4: Commit only verification fixes**

If a check exposes a regression, add a focused fix and rerun the affected command before committing.

- [ ] **Step 5: Prepare the E11 PR**

Push the branch, open a PR into `main` with `E11` in the title, and paste the command output plus acceptance evidence into the E11 issue. Do not mark the epic done until it is merged and the epic file and issue are updated.
