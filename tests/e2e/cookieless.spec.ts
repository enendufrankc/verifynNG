import { test, expect } from '@playwright/test';

/**
 * Cookie-less-by-default is a tested invariant of web-verify (see
 * docs/compliance/data-map.md and content/legal/cookie/en.md). This suite
 * only makes sense against the web-verify projects — playwright.config.ts's
 * testMatch already keeps it out of web-admin-desktop, but each test also
 * skips itself by project name as a second guard (web-admin is an
 * authenticated app with a real session cookie by design).
 *
 * Routes covered are limited to what actually exists today: `/`, `/status`,
 * and `/legal/*` (T3, this epic). `/verify`, `/v/<code>` (E06/E09) and
 * `/p/<tenant>/<product>` (E10) don't exist on web-verify yet — add them to
 * `ROUTES` once those epics ship.
 */
const ROUTES = [
  '/',
  '/status',
  '/legal/privacy',
  '/legal/terms',
  '/legal/aup',
  '/legal/cookie',
  '/legal/subprocessors',
];

test.describe('cookie-less web-verify @compliance', () => {
  for (const route of ROUTES) {
    test(`sets no cookies and no storage on ${route}`, async ({
      page,
      context,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith('web-verify'),
        'web-verify only — web-admin is an authenticated app with its own privacy policy',
      );

      await page.goto(route);

      expect(await context.cookies()).toEqual([]);

      const storage = await page.evaluate(() => ({
        localStorage: Object.keys(window.localStorage),
        sessionStorage: Object.keys(window.sessionStorage),
        cookie: document.cookie,
      }));
      expect(storage.localStorage).toEqual([]);
      expect(storage.sessionStorage).toEqual([]);
      expect(storage.cookie).toBe('');
    });
  }
});
