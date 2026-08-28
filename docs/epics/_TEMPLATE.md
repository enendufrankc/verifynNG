# EXX — <Epic title>

| | |
|---|---|
| Wave | N |
| Status | todo |
| Owner | — |
| GitHub Issue | — |
| Depends on | EXX, EYY |
| Unblocks | EZZ |
| Readiness items | `production-readiness.md` §N rows … / `architecture.md` step N |

## Goal

One paragraph. What exists when this epic is done and why the product is fake without it.

## Scope

**In:** bullet list.

**Out:** bullet list — name the epic that owns each excluded thing.

## Owned paths

```
apps/api/src/modules/<name>/**
apps/web-admin/app/(console)/<name>/**
packages/db/prisma/schema.prisma        (additive block: "EXX")
tools/fakes/<name>/**                   (if any)
```

## Interfaces

**Consumes** (from other epics): list of providers / events / models / routes.

**Exposes**: Nest providers, HTTP routes, domain events (name + payload), Prisma models. These are the contract downstream epics build against — keep them stable.

## Data model

Prisma models/fields this epic adds. Keep tenant scoping explicit (`tenantId` on every tenant-owned row).

## Tasks

- [ ] T1 …
- [ ] T2 …

Ordered so an agent can work top-down. Each task should be a PR-sized unit.

## Acceptance criteria

Every criterion is demonstrable against `docker compose up`. Include the exact command / URL / flow.

- [ ] AC1 …

## Testing

Unit / integration (real Postgres) / E2E (Playwright) — what specifically must be covered.

## Compose services added

None, or list with image and port.

## Notes and decisions

Decisions taken while building, links to discussions.
