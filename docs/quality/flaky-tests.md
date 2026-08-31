# Flaky Test Policy

## Definition

A test is **flaky** if it fails, then passes on retry, with no code change in between. That's the
only signal that matters — don't guess from a stack trace alone; confirm with a retry (CI does
this automatically, see below) or by running the test a few times locally.

A test that fails _consistently_ is not flaky — it's broken (or the product is). Fix it like any
other bug, on the timeline the failure demands. Don't reach for `test.fixme` on it.

## Quarantine

1. **Within 24h** of a test flaking (confirmed per the definition above), mark it with
   `test.fixme(reason)` (Playwright) or the Vitest equivalent, and open an issue labelled
   `flaky` linking the test file/name and a run where it flaked.
2. The test's owner (the epic whose spec it is) has **7 days** to fix it or determine it isn't
   actually flaky (e.g. it was masking a real intermittent product bug — un-quarantine and fix
   that instead).
3. Quarantined tests still run, but in a **non-blocking** nightly job — they don't fail the
   build, and their pass/fail is tracked so a fix can be verified before lifting the quarantine.
4. `release-gate.yml` refuses (red job) if any `flaky`-labelled issue is older than 7 days —
   quarantine is a temporary state, not a place tests go to be forgotten.

## Retry configuration

- **Playwright** (`playwright.config.ts`): `retries: 1` in CI only (`retries: 0` locally — a
  test that needs a retry to pass locally is telling you something; don't hide it). The
  `github` reporter annotates retried tests in the job summary automatically, which is how a
  test gets _noticed_ as a flake candidate in the first place.
- **Vitest** (`vitest.workspace.ts` / package `vitest.config.ts`): `retry: 0` everywhere. Unit
  and integration tests hit real Postgres/Redis via `createTestDatabase()`, not a browser — a
  retry masking a real race there is a real bug, not test flakiness.

## Why not just retry forever

Retries exist to _gather evidence_ that a failure is nondeterministic, not to make CI green
regardless of what's actually happening. A test quarantined for months without a fix is a gap in
coverage nobody is looking at — the 7-day owner window and the release-gate's 7-day cutoff exist
specifically to stop that from becoming the default.
