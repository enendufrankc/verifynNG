import type { Page } from '@playwright/test';

const VERIFY_BASE = `http://localhost:${process.env.WEB_VERIFY_PORT ?? '3000'}`;

/**
 * Navigate to a path on the consumer web-verify app by absolute URL —
 * mirrors openConsole(). Needed by specs (like product-pages) that mix
 * web-admin and web-verify navigation in one test: `pnpm test:e2e` runs
 * every spec under all three Playwright projects, so a plain relative
 * page.goto() would resolve against whichever app's baseURL happens to be
 * active for that project, not necessarily the app the step actually needs.
 */
export async function openVerify(page: Page, path: string): Promise<void> {
  await page.goto(`${VERIFY_BASE}${path}`);
}
