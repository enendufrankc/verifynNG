import type { Page } from '@playwright/test';
import { loadManifest } from './manifest.js';

/**
 * TODO(E02): This will use E02's login flow. Currently a stub that
 * navigates to the page.
 */
export async function loginAs(
  page: Page,
  role: string,
  tenantSlug?: string,
): Promise<void> {
  // TODO(E02): implement real login via E02's auth routes
  const manifest = loadManifest();
  const _tenant = tenantSlug
    ? manifest.tenants[tenantSlug]
    : manifest.tenants['ivoryglow'];
  void _tenant;
  await page.goto('/');
}

/**
 * TODO(E20): SSO login stub.
 */
export async function loginViaSso(page: Page): Promise<void> {
  // TODO(E20): implement SSO login via fake-oidc
  await page.goto('/');
}
