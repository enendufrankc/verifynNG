import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth';
import { seedReports } from './fixtures/reports';

// NOTE: tests/e2e/fixtures/auth.ts's loginAs(page, role) is still E02's stub
// (navigates to '/' only, sets no session). This spec is written against the
// documented, intended contract per this repo's "consume interfaces, not
// internals" agreement — E02 owns that fixture, E08 doesn't reach into it.
// Until E02 wires a real login, the AC5 test below will fail once it reaches
// the first authenticated-only assertion (no session ⇒ `canAct` is false in
// apps/web-admin/app/(console)/reports/[id]/page.tsx ⇒ action buttons never
// render). It will start passing automatically once E02 ships.

test.describe('E08 Consumer Fake Reporting', () => {
  test.beforeAll(async ({ request }) => {
    await seedReports(request);
  });

  test('AC5: operator triages a seeded report end to end', async ({ page }) => {
    await loginAs(page, 'operator');
    await page.goto('/reports');
    // DataTable renders a desktop table and mobile cards (both in the DOM).
    await page.getByRole('link', { name: 'RPT-SEED00' }).first().click();

    await page.getByRole('button', { name: 'Assign to me' }).click();
    await page
      .getByPlaceholder('Add a note…')
      .fill('Investigating seller claims');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText('Investigating seller claims')).toBeVisible();

    await page.getByRole('button', { name: 'Change status' }).click();
    // status-dialog.tsx's <Select> is Radix (packages/ui/src/components/ui/select.tsx),
    // not a native <select> — its trigger renders role="combobox" and each
    // option role="option", so this is a click + click, not selectOption().
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'triaged' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('new → triaged')).toBeVisible();
  });

  test('AC7: CSV export omits contact columns for operator, includes for owner', async () => {
    // Blocked on E02: loginAs is still a stub, and the realistic seed's users
    // (packages/db/prisma/seed/realistic/tenants.ts) store a placeholder
    // bcrypt hash ($2b$10$FAKEHASH_FOR_SEED_REPLACE_WHEN_E02_SHIPS) — there is
    // no known password to exchange for a real, role-scoped JWT via
    // POST /auth/login without editing a seed file outside E08's owned paths.
    // Fabricating a JWT would bypass real auth and defeat the point of this
    // test, so this stays skipped rather than faked.
    //
    // Also: apps/web-admin/app/(console)/reports/page.tsx (Task 9) has no
    // "Export" button today, so there is no UI-level fallback either — only a
    // direct API-level test (curl/request against
    // GET /v1/reports/export.csv?status=closed, asserting the operator
    // response omits `contactEmail` and the owner response includes it) will
    // exercise AC7 once a real login is available.
    test.skip(
      true,
      'blocked on E02: loginAs stub + no real password for seeded users',
    );
  });
});
