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

module.exports = {
  ci: {
    collect: {
      url: [`${baseUrl}/v/${fixtureCode}`, `${baseUrl}/verify`],
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
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        budgets,
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './lighthouse/.lhci',
    },
  },
};
