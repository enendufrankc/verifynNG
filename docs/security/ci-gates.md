# Security CI gates

`.github/workflows/security.yml` runs three jobs on every push/PR to `main`
plus a weekly schedule: `pnpm-audit`, `gitleaks`, `codeql`. Dependabot
(`.github/dependabot.yml`) opens its own PRs on the same weekly/monthly
cadence — it isn't a check, so it never blocks a PR.

> **Temporary, same as noted in `AGENTS.md`**: GitHub Actions is disabled
> account-wide (billing lock) as of 2026-08-28, so none of these jobs are
> actually running yet. This doc is written for when they come back online.

## `pnpm-audit`

Runs `pnpm audit --audit-level=high` — fails on any high or critical
severity advisory in the resolved dependency tree.

**Known pre-existing failures (as of this writing):** the current lockfile
has 4 high-severity advisories, all in transitive dependencies E13 doesn't
own or control directly:

- `postcss` (via `next`, used by both `web-admin` and `web-verify`) — two
  advisories, both source-map path traversal issues. Fixed upstream in
  `postcss@8.5.18`; blocked on `next` bumping its own dependency.
- `deepmerge-ts` (via `prisma`/`@prisma/client`) — stack exhaustion on
  recursive merges. Fixed upstream in `deepmerge-ts@8.0.0`; blocked on
  Prisma bumping its own dependency.

Neither is exploitable through anything this app actually does with those
packages (we don't merge attacker-controlled recursive objects through
Prisma's CLI tooling, and we don't serve arbitrary CSS with attacker-set
`sourceMappingURL` comments), but `pnpm audit --audit-level=high` doesn't
know that — it will report **red** until `next` and `prisma` themselves
release patched versions and this repo bumps to them. Bumping the app's
direct dependency doesn't fix a transitive one; whoever picks this up next
should re-run `pnpm audit --audit-level=high` and confirm it's actually
clear before treating a still-red run as a new regression.

**Triage a new failure:**

1. `pnpm audit --audit-level=high` locally to see the same report CI sees.
2. `pnpm why <package>` to find what pulled it in.
3. If it's a direct dependency: bump it (`pnpm update <package>` or bump the
   version in the owning package's `package.json`), re-run the audit.
4. If it's transitive (as above): check whether the parent package has a
   newer release that bumps it. If yes, bump the parent. If no, this is a
   known-red baseline — document it here rather than silently ignoring it,
   and don't add `--audit-level=critical` or similar to dodge it; that
   would hide a real advisory from view instead of tracking it.

## `gitleaks`

Scans the full history (`fetch-depth: 0`) for committed secrets, using
`.gitleaks.toml` at the repo root (gitleaks' default config location — no
explicit `--config` flag needed, though the workflow sets `GITLEAKS_CONFIG`
for clarity). The only allowlist entry is
`packages/core/test/fixtures/**`, since those fixtures intentionally
contain fabricated key-shaped strings for `packages/core`'s own tests.

**Triage a finding:** if it's a real secret, rotate it immediately (see
`docs/security/key-rotation-runbook.md` if it's the core signing key),
_then_ scrub history — never just delete the file and move on, since the
value stays reachable in git history otherwise. If it's a false positive
outside the existing allowlist, add a narrowly-scoped path (or a rule
exception, per gitleaks' config format) — never disable the whole job.

## `codeql`

Static analysis for `javascript-typescript` (covers both the NestJS API and
the two Next.js apps). Findings appear in the repo's Security tab, not as
inline PR comments. Triage each finding on its own merits in the Security
tab; there's no repo-specific config here yet since none have been
triaged.
