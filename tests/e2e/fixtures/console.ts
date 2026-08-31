import type { Page } from '@playwright/test';

const ADMIN_BASE = `http://localhost:${process.env.WEB_ADMIN_PORT ?? '3001'}`;

/**
 * Navigate to a path in the admin console.
 */
export async function openConsole(page: Page, path: string): Promise<void> {
  await page.goto(`${ADMIN_BASE}${path}`);
}
