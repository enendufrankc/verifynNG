# Contributing to verifynNG

## Prerequisites

- Node.js 22 LTS (use `.nvmrc`)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker & Docker Compose

## Getting started

```bash
pnpm install
docker compose -f docker/compose.yml up -d
pnpm db:migrate
pnpm db:seed        # creates ivoryglow tenant + 3 products
```

## Worktree flow

Each epic gets its own worktree and branch:

```bash
git worktree add ../verifynNG-EXX -b epic/EXX-<slug> main
# or use: scripts/epic start EXX
```

## PR checklist

- [ ] Branch name follows `epic/EXX-<slug>` convention
- [ ] Conventional commit: `feat(E06): description`
- [ ] PR title carries the epic id
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green
- [ ] `docker compose config` validates
- [ ] No changes outside owned paths (or hot-spot rules followed)
- [ ] Additive-only changes to `schema.prisma`
- [ ] No `.env*` committed (except `.env.example`)
- [ ] Tests cover new logic; integration tests hit real Postgres

## Commit conventions

- Format: `type(scope): description`
- Scope is the epic id: `feat(E06): tier-2 verdict engine`
- Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
