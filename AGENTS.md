# AGENTS.md — verifynNG

Operating contract for any coding agent (Claude Code, Codex, Pi, Cursor, human) working in this repo.

## What this is

The Verify Platform: a multi-tenant product-authenticity SaaS. Brands mint cryptographically secure unit codes, deliver them to manufacturers as signed manifests, consumers scan a QR to verify. IVORY GLOW is tenant #1, not the architecture. Read `docs/verify-platform-mental-model.md` before touching verification or code-format logic.

Current state: **planning complete, code not yet started.** `legacy/verify-platform/` is the milestone-1 JavaScript prototype — read it for behaviour, never import it. The TypeScript rewrite is being built epic by epic.

## Work is organised as epics

`docs/epics/README.md` is the map: stack, repo layout, 22 epics in 4 waves, dependency graph, the working agreement, and the shared hot-spot rules. **Read it before picking anything up.** Each epic is a file `docs/epics/EXX-*.md` and a GitHub Issue labelled `epic`.

The working agreement in short:

1. Claim the epic (assign the issue, set Owner + Status in the file via a one-line PR).
2. `git worktree add ../verifynNG-EXX -b epic/EXX-<slug> main` — one epic, one worktree, one branch.
3. Stay inside the epic's **Owned paths**. Shared files follow the hot-spot rules in the README.
4. Small PRs into `main`; CI green; `main` always `docker compose up`s cleanly.
5. Build against published **Interfaces** of other epics; stub behind them if upstream hasn't shipped.
6. Tests are in scope. Integration tests hit real Postgres. Don't mock what we own.
7. Verify every acceptance criterion against `docker compose up` and paste evidence in the issue before closing.

Commit format: `feat(E06): tier-2 verdict engine`. PR titles carry the epic id.

## Commands

Until E00 lands there are none. E00 defines them; when it does, this section is updated to list:

```
pnpm install
docker compose -f docker/compose.yml up -d     # full local stack
pnpm dev                                        # turbo dev across apps
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e
pnpm db:migrate | db:reset | db:seed
```

Verification before claiming done = those commands green **and** the epic's acceptance criteria demonstrated on the compose stack.

## Guardrails

- Never commit `.env*` (except `.env.example`), key material, `data/` dumps, or anything under `legacy/*/data`.
- Never store a raw tier-2 code anywhere except the encrypted manifest object. Never log or return one.
- Tenant id comes from the authenticated context (`@TenantId()`), never from the client. Every tenant-owned query is scoped by it.
- Tier-1 verification stays stateless. Verdict logic lives only in E06's engine.
- No cloud infra work in any epic — local Docker is the target. Infra is a later, separate effort.
- Additive-only changes to `schema.prisma`; one migration per PR; never edit another epic's models.
- Don't add external services or accounts. Every integration is a port with a local fake in compose.

## Layers of guidance

- This file — repo contract.
- `docs/epics/` — what to build, per epic.
- `docs/*.md` — why (mental model, architecture, readiness).
- `CLAUDE.md` just imports this file.
