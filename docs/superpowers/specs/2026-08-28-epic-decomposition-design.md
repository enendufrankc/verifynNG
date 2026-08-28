# Epic decomposition for parallel multi-agent development — design

Date: 2026-08-28. Status: approved.

## Problem

The Verify Platform exists as a milestone-1 JavaScript prototype (`legacy/verify-platform/`) and three design docs. `docs/verify-platform-production-readiness.md` lists everything a production-grade multi-tenant SaaS needs. We want several coding agents (Claude, Codex, Pi, …) to each own a slice and build it to completion in isolated worktrees, with the whole product working end-to-end in a local Docker stack. Cloud infrastructure is explicitly deferred.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Backend | Full TypeScript rewrite: NestJS + Prisma + PostgreSQL | Nest modules map one-to-one onto epics, giving agents hard boundaries; Prisma migrations give a clear shared-schema protocol |
| Frontends | Two Next.js apps (`web-verify`, `web-admin`) in a pnpm/Turborepo monorepo | Consumer page needs SSR for QR landings; console is a different audience and deploy unit |
| Auth | Own implementation (email+password, JWT, TOTP MFA, RBAC); SSO as a later epic | Fully local and testable; no external dependency for the core |
| External services | Ports + adapters with a local fake per service in compose | Whole platform runs offline; real adapters swap in via env |
| Scope | All readiness tiers P0–P2 | User wants the complete production-grade target defined now so any epic can be claimed |
| Tracking | Markdown in `docs/epics/` as source of truth, mirrored to GitHub Issues + Project on `enendufrankc/verifynNG` | Tool-agnostic for every agent; humans get a board |
| Repo | New monorepo in `verifynNG`; prototype and docs copied in under `legacy/` and `docs/` | Clean slate; reference stays readable |

## Decomposition principles

- **Vertical slices.** A feature epic owns its API module, admin screens, tests and fakes. E11 provides only the console shell and design system.
- **Wave 0 is sequential.** E00 (foundation) and E01 (code engine) land before anything runs in parallel.
- **Interfaces are the contract.** Each epic publishes providers, routes, events and models. Downstream epics stub behind them if upstream hasn't shipped.
- **Owned paths.** Each epic lists the directories it may edit; shared hot-spots (Prisma schema, admin nav, env schema, compose file, `AppModule`, `packages/core`) have explicit rules.
- **Acceptance = demonstrable in `docker compose up`.** Every criterion names a command, URL or flow.

## The epic set

See `docs/epics/README.md` for the table, dependency graph and working agreement. 22 epics: E00–E21, in waves 0–3 plus cross-cutting E21 Quality Engineering.

## Out of scope for this design

Cloud hosting, DNS, IaC, CI deploy stages, multi-region — all readiness §4 rows beyond CI and environment separation. A later infra planning pass will map the compose stack onto Firebase/Cloudflare/AWS.
