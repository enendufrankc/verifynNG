import { test, expect } from '@playwright/test';
import {
  getPrisma,
  seedVerifyFixtures,
  type VerifyFixtures,
} from './fixtures/index.js';

/**
 * Strips <script> tag contents before a leak check. Next.js's App Router
 * always embeds the literal dynamic-segment value (the full code, on the
 * very first response) in an inline script — its RSC "flight payload",
 * used for client-side hydration/history bookkeeping — regardless of what
 * app code does with `params.code`. Confirmed live: this exists even
 * requesting an already-redacted-looking path directly, so it reflects
 * the actually-requested URL, not anything this app's code controls; a
 * middleware rewrite was tried and confirmed NOT to change it (see the
 * commit this test file shipped in for the investigation). This is a
 * verified, narrow, upstream-framework limitation — tracked as a known gap
 * in docs/epics/E09-verify-web.md, not something believed fixable here.
 * What *is* fully verified clean is everything a screenshot, copy-paste,
 * or "View Source" reading of rendered text would show — which is what
 * this file actually asserts.
 */
function stripScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}

test.describe('E09 share-safe @e09', () => {
  let fixtures: VerifyFixtures;

  test.beforeAll(async () => {
    fixtures = await seedVerifyFixtures(getPrisma());
  });

  // Each test below uses a *different* fixture unit — visiting the same
  // one twice within this file would itself turn a would-be "authentic"
  // (first scan) verdict into "already-verified" on the second visit,
  // which isn't what these tests are checking (share-safety applies to
  // every verdict alike, not specifically to "authentic").

  test('the full code never appears outside an inline script in the raw HTML response', async ({
    request,
  }) => {
    const code = fixtures.authenticFirstScan;
    const res = await request.get(`/v/${code}`);
    const body = await res.text();
    expect(stripScripts(body)).not.toContain(code);
  });

  test('the address bar is rewritten to the redacted code after hydration', async ({
    page,
  }) => {
    const code = fixtures.tier1Ok;
    await page.goto(`/v/${code}`);
    await expect(page.locator('h1')).toHaveText('Genuine');
    // ShareSafeUrl's history.replaceState fires on mount — wait for it.
    await expect
      .poll(() => new URL(page.url()).pathname)
      .not.toBe(`/v/${code}`);
    expect(page.url()).not.toContain(code);
    // tenant.tier.kid.payload.checksum
    const [, , kid, payload] = code.split('.');
    expect(page.url()).toContain(kid);
    expect(page.url()).toContain(payload.slice(0, 4));
  });

  test('no rendered link or attribute carries the full code (e.g. the footer language switcher)', async ({
    page,
  }) => {
    const code = fixtures.flagged;
    await page.goto(`/v/${code}`);
    await expect(page.locator('h1')).toHaveText('Flagged by the brand');
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) => links.map((l) => l.getAttribute('href')));
    for (const href of hrefs) {
      expect(href).not.toContain(code);
    }
  });

  test('robots.txt disallows /v/', async ({ request }) => {
    const res = await request.get('/robots.txt');
    const body = await res.text();
    expect(body).toMatch(/Disallow:\s*\/v\//);
  });
});
