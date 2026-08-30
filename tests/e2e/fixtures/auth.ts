import type { Page } from '@playwright/test';
import { loadManifest } from './manifest.js';

/** Dev password every `pnpm db:seed` user is created with (see packages/db/prisma/seed.ts). */
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';

/** Well-known dev fixture emails from the default (non-realistic) seed, keyed by role. */
const SEED_EMAIL_BY_ROLE: Record<string, string> = {
  owner: 'owner@ivoryglow.local',
  operator: 'operator@ivoryglow.local',
  viewer: 'viewer@ivoryglow.local',
  support: 'support@verifyng.local',
  oem: 'oem@guangzhou-pack.test',
};

/**
 * Logs in via the real `/login` form as the given role, then waits for the
 * post-login redirect. Uses the default `pnpm db:seed` fixtures (ivoryglow
 * tenant) by role name; pass `tenantSlug` only when running against the
 * `db:seed:realistic` manifest instead, which seeds many tenants/users.
 *
 * Note: `db:seed:realistic`'s users currently have a placeholder password
 * hash (`FAKEHASH_FOR_SEED_REPLACE_WHEN_E02_SHIPS` in
 * prisma/seed/realistic/tenants.ts) that predates E02's real argon2-based
 * auth and was never updated after E02 shipped — so today, only the default
 * seed's users (the role names above) can actually log in through this.
 */
export async function loginAs(
  page: Page,
  role: string,
  tenantSlug?: string,
): Promise<void> {
  let email = tenantSlug ? undefined : SEED_EMAIL_BY_ROLE[role];

  if (!email) {
    const manifest = loadManifest();
    const tenant = tenantSlug
      ? manifest.tenants[tenantSlug]
      : manifest.tenants['ivoryglow'];
    const match = Object.values(manifest.users).find(
      (u) => u.role === role && (!tenant || u.tenantSlug === tenant.slug),
    );
    if (!match) {
      throw new Error(
        `loginAs: no seeded user found for role "${role}"${tenantSlug ? ` in tenant "${tenantSlug}"` : ''}`,
      );
    }
    email = match.email;
  }

  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

/**
 * TODO(E20): SSO login stub.
 */
export async function loginViaSso(page: Page): Promise<void> {
  // TODO(E20): implement SSO login via fake-oidc
  await page.goto('/');
}
