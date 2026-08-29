import type { Page } from '@playwright/test';

const ADMIN_BASE = process.env.ADMIN_BASE_URL ?? 'http://localhost:3001';

/**
 * Navigate to a path in the admin console.
 */
export async function openConsole(page: Page, path: string): Promise<void> {
  await page.goto(`${ADMIN_BASE}${path}`);
}
