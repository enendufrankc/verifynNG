import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';
import { payOnFakeCheckout } from '../fixtures/pay';
import { waitForEmail } from '../fixtures/mailpit';
import { getPrisma } from '../fixtures/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
// Both tests in this file mutate db:seed's real, login-capable `ivoryglow`
// tenant's Subscription row (see fixtures/auth.ts for why it, not a fresh
// tenant, is used) — `test.describe.serial` below keeps them from racing
// each other across workers; each reverts its own mutations in `finally`,
// including on failure, so re-runs and unrelated specs see it back in its
// seeded state.
const TENANT_ID = 'ivoryglow';
const OWNER_EMAIL = 'owner@ivoryglow.local';
const OWNER_PASSWORD = 'Passw0rd!Passw0rd!';

test.describe.serial('E15 billing: plan change and dunning @billing', () => {
  // Playwright requires the fixtures arg to be destructured, even when
  // unused, to detect which fixtures a hook depends on.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'web-admin-desktop',
      'admin-console-only spec',
    );
  });

  test('AC3: upgrading Starter -> Growth redirects to checkout; paying updates the plan, issues a paid invoice, and its PDF downloads correctly', async ({
    page,
    request,
  }) => {
    const prisma = getPrisma();
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: TENANT_ID },
    });
    const existingInvoiceIds = new Set(
      (
        await prisma.invoice.findMany({
          where: { tenantId: TENANT_ID },
          select: { id: true },
        })
      ).map((i) => i.id),
    );

    try {
      await loginAs(page, 'owner');
      await page.goto('/billing/change-plan');
      await expect(
        page.getByRole('heading', { name: 'Change plan' }),
      ).toBeVisible();

      // Card order is Free trial, Starter, Growth, Enterprise; Starter is
      // the current plan (disabled "Current plan") and Enterprise is
      // disabled ("Contact support" — customPricing), leaving exactly two
      // enabled "Select" buttons: Free trial (downgrade) and Growth
      // (upgrade) — Growth is the second one.
      await page.getByRole('button', { name: 'Select' }).nth(1).click();
      await expect(
        page.getByRole('heading', { name: /Switch from .* to Growth\?/ }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Confirm' }).click();

      // Real redirect to the fake-pay hosted checkout (not a mock).
      await page.waitForURL(/\/checkout\//, { timeout: 15_000 });
      const result = await payOnFakeCheckout(page);
      expect(result.success).toBe(true);

      await page.goto('/billing');
      await expect(page.getByText('Growth', { exact: true })).toBeVisible();
      await expect(page.getByText('Active', { exact: true })).toBeVisible();

      // The webhook that marks the invoice paid is processed asynchronously
      // by api-worker's BullMQ job, not synchronously with fake-pay's
      // redirect — poll rather than assert immediately (same idiom as
      // fixtures/mailpit.ts's waitForEmail, and the AC5/AC6 test below).
      const deadline = Date.now() + 10_000;
      let newInvoice = await prisma.invoice.findFirstOrThrow({
        where: { tenantId: TENANT_ID, id: { notIn: [...existingInvoiceIds] } },
      });
      while (newInvoice.status !== 'paid' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        newInvoice = await prisma.invoice.findUniqueOrThrow({
          where: { id: newInvoice.id },
        });
      }
      expect(newInvoice.status).toBe('paid');

      await waitForEmail(request, 'paid', { to: OWNER_EMAIL });

      // Direct API assertion on the PDF itself (content-type + size), not
      // just that a download click fired — mirrors analytics.spec.ts's
      // direct-API pattern for asserting response shape Playwright's
      // `download` event doesn't expose.
      const loginRes = await request.post(`${API_URL}/auth/login`, {
        data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
      });
      const { accessToken } = (await loginRes.json()) as {
        accessToken: string;
      };
      const pdfRes = await request.get(
        `${API_URL}/v1/tenants/${TENANT_ID}/billing/invoices/${newInvoice.id}/pdf`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      expect(pdfRes.status()).toBe(200);
      expect(pdfRes.headers()['content-type']).toBe('application/pdf');
      const body = await pdfRes.body();
      // The epic's own "Testing" section says "size > 10 KB", but every
      // real invoice PDF this renderer produces (NotoSans-Regular.ttf
      // embedded for ₦/£ glyph support, dominating file size regardless of
      // line-item count) lands around 8.3-8.4 KB — confirmed both here (a
      // 2-line proration invoice) and manually in T11 (a 3-line AC4
      // invoice, 8368 bytes). 5 KB is a real "not truncated/corrupted"
      // floor for this renderer, not the doc's untested >10 KB guess.
      expect(body.byteLength).toBeGreaterThan(5 * 1024);
    } finally {
      const createdInvoices = await prisma.invoice.findMany({
        where: { tenantId: TENANT_ID, id: { notIn: [...existingInvoiceIds] } },
      });
      for (const inv of createdInvoices) {
        await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
        await prisma.invoice.delete({ where: { id: inv.id } });
      }
      await prisma.subscription.update({
        where: { tenantId: TENANT_ID },
        data: {
          planId: before.planId,
          pendingPlanId: before.pendingPlanId,
          status: before.status,
        },
      });
    }
  });

  test('AC5/AC6: a restricted subscription shows the banner on every console page; paying the outstanding invoice reactivates it', async ({
    page,
  }) => {
    const prisma = getPrisma();
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: TENANT_ID },
    });

    // Real dunning (3 retry cycles at 1/3/7-day delays, BullMQ-scheduled) is
    // not automatable through Playwright without BILLING_CLOCK_SKEW_SECONDS
    // set on the running compose stack — a container-level env, not
    // per-test-togglable (BillingClock reads it via loadEnv(), which
    // memoizes at process scope). That retry schedule itself is already
    // covered by dunning.service.integration.spec.ts and was verified live
    // against a clock-skewed stack for T9/AC5 (evidence on issue #16). This
    // test seeds dunning's *outcome* directly — a restricted subscription
    // with one outstanding invoice — and automates the genuinely
    // UI-testable part: the shell-wide banner and the pay-to-reactivate
    // round trip.
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: TENANT_ID,
        number: `E2E-DUNNING-${Date.now()}`,
        status: 'issued',
        currency: 'NGN',
        periodStart: new Date(),
        periodEnd: new Date(),
        subtotalMinor: 100_000,
        taxMinor: 0,
        totalMinor: 100_000,
        issuedAt: new Date(),
        dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        attemptCount: 3,
        usageSnapshot: {},
      },
    });
    await prisma.subscription.update({
      where: { tenantId: TENANT_ID },
      data: { status: 'restricted', restrictedAt: new Date() },
    });

    try {
      await loginAs(page, 'owner');

      // Dashboard, not a billing page — proves the banner is shell-wide
      // (AC5), not just shown on /billing itself.
      await page.goto('/');
      const bannerText = page.getByText(
        'Minting is restricted until the outstanding invoice is paid.',
      );
      await expect(bannerText).toBeVisible();

      const payNowLink = page.getByRole('link', { name: 'Pay now' });
      await payNowLink.click();
      await expect(page).toHaveURL(/\/billing\/invoices$/);

      await page.getByRole('link', { name: invoice.number }).click();
      await page.getByRole('button', { name: 'Pay now' }).click();

      await page.waitForURL(/\/checkout\//, { timeout: 15_000 });
      const result = await payOnFakeCheckout(page);
      expect(result.success).toBe(true);

      // The webhook that flips Subscription.status back to 'active' is
      // processed asynchronously by api-worker's BullMQ job, not
      // synchronously with fake-pay's redirect — poll rather than assert
      // immediately (same idiom as fixtures/mailpit.ts's waitForEmail).
      const deadline = Date.now() + 10_000;
      let after = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: TENANT_ID },
      });
      while (after.status !== 'active' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        after = await prisma.subscription.findUniqueOrThrow({
          where: { tenantId: TENANT_ID },
        });
      }
      expect(after.status).toBe('active');

      await page.goto('/');
      await expect(bannerText).not.toBeVisible();
    } finally {
      await prisma.payment.deleteMany({ where: { invoiceId: invoice.id } });
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await prisma.invoice.delete({ where: { id: invoice.id } });
      await prisma.subscription.update({
        where: { tenantId: TENANT_ID },
        data: { status: before.status, restrictedAt: before.restrictedAt },
      });
    }
  });
});
