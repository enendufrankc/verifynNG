# E09 Platform Landing Implementation Plan

> Execution: inline using executing-plans; approved design in docs/design/2026-09-09-platform-landing.md.

**Goal:** Replace the placeholder homepage with an accessible platform landing page for shoppers and brands.
**Architecture:** Server-rendered LandingPage and ProductIllustration; a small pathname-aware PublicShell preserves the existing tenant UI on non-home routes. APP_BASE_URL supplies the existing admin signup/login destinations.
**Tech Stack:** Next.js 15, React 19, shared Tailwind tokens, CSS modules, Lucide, Vitest and Playwright.

- [x] Add browser coverage in tests/e2e/verify-landing.spec.ts for heading, example labelling, working verification CTA, platform versus tenant footer, keyboard/a11y, small viewport overflow and no-JS links. Run against baseline and observe the missing landing page.
- [x] Implement apps/web-verify/components/landing/{LandingPage,ProductIllustration}.tsx and landing.module.css. Use the approved copy and Direction A tokens; label the decorative result as an example. Link public QR/hidden-code education to existing /verify.
- [x] Add components/shell/PublicShell.tsx; preserve existing tenant styling and footer on all other paths, and render the standalone homepage at /. Update app/layout.tsx and app/page.tsx; supply APP_BASE_URL on the web-verify compose service.
- [x] Run the web-verify unit suite and build, then desktop/mobile browser coverage and screenshot review against the isolated compose stack. Check navigation back to home and no-JS operation.
- [ ] Run pnpm lint, pnpm typecheck, pnpm test, pnpm build and pnpm test:e2e. Record exact results and distinguish unrelated baseline failures.
- [ ] Commit, push and open an E09 PR with evidence; follow the repo merge requirements and report any remaining step explicitly.

## Verification findings

- Added one exact public `/signup` exception in web-admin middleware after the E11 cross-epic notice. Browser checks also assert anonymous `/products` remains protected. The separate existing account-creation integration gap is tracked as #95.
- Hero text/actions remain stationary; illustration uses transform-only motion with reduced-motion support. This fixes JavaScript-disabled click instability and keeps text contrast stable during entrance motion.
- Worktree docs port 3965 was added to the generated, uncommitted env files because scripts/epic currently omits DOCS_PORT. Ran standard minio-init after the initial port collision interrupted compose startup.
- Final landing browser suite: 12 passed on production Docker, including desktop/mobile, accessibility, no-JavaScript navigation, signup/login reachability and console protection.
