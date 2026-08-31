// Per-worktree port (scripts/epic start writes WEB_VERIFY_PORT into .env,
// same convention as the root playwright.config.ts).
const port = process.env.WEB_VERIFY_PORT || '3000';
const baseUrl = `http://localhost:${port}`;

// A deterministic, DB-independent path by default — this string never has
// a valid HMAC checksum, so it always renders the `invalid` verdict with
// zero seeding required. Override with a real fixture code once E21 ships
// stable seeded fixtures (CROSS-EPIC-REQUESTS.md) so CI checks a
// data-rich verdict page instead.
const fixtureCode =
  process.env.LIGHTHOUSE_FIXTURE_CODE || 'lighthouse-fixture-check';

const budgets = require('./lighthouse/budgets.json');

// E10 (AC9): `pnpm --filter web-verify lighthouse -- --url=/p/ivoryglow/
// turmeric-curcumin` scopes the run to exactly that path and adds the `seo`
// category (its own threshold — never loosens performance/accessibility/
// best-practices below E09's bar). `lhci autorun` re-invokes itself as
// separate `collect`/`assert` subcommands internally and does not forward
// unrecognised CLI flags across that boundary (confirmed empirically — a
// `--url` flag here is silently dropped by the time the `collect` phase
// re-requires this file), so lighthouse/run.js — the actual `lighthouse`
// script entrypoint — parses `--url` up front and re-execs through this
// env var instead, which *does* survive lhci's internal re-invocations.
// Omitting --url (or calling `lhci` directly) runs E09's original
// multi-page collection unchanged.
const overridePath = process.env.LIGHTHOUSE_URL_OVERRIDE || null;
const overrideUrl = overridePath ? `${baseUrl}${overridePath}` : null;

const collectUrl = overrideUrl
  ? [overrideUrl]
  : [`${baseUrl}/v/${fixtureCode}`, `${baseUrl}/verify`];
const onlyCategories = overrideUrl
  ? ['performance', 'accessibility', 'best-practices', 'seo']
  : ['performance', 'accessibility', 'best-practices'];
const assertions = {
  'categories:performance': ['error', { minScore: 0.9 }],
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'categories:best-practices': ['error', { minScore: 0.95 }],
  ...(overrideUrl ? { 'categories:seo': ['error', { minScore: 0.95 }] } : {}),
};

module.exports = {
  ci: {
    collect: {
      url: collectUrl,
      numberOfRuns: 1,
      settings: {
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
        throttlingMethod: 'simulate',
        onlyCategories,
        budgets,
      },
    },
    assert: {
      assertions,
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse/.lhci',
    },
  },
};
