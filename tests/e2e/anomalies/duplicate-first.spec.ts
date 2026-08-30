import { test, expect } from '@playwright/test';
import {
  loginAs,
  mintTestBatch,
  verifyCode,
  waitForAnomaly,
  warmFakeGeo,
} from '../fixtures/anomaly-helpers';

// AC5 — duplicate-first: two verifies of one unit within the window from
// Lagos then Kano raise a score-80 anomaly, auto-flag the unit, and the
// evidence timeline never renders coordinates.
test.describe('AC5: duplicate-first @e07', () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured first param
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'web-admin-desktop', 'web-admin only');
  });

  test('flags a unit scanned from two far-apart cities within the window, no coordinates rendered', async ({
    page,
    request,
  }) => {
    const { units } = await mintTestBatch(
      request,
      1,
      `e07-e2e-ac5-${Date.now()}`,
    );
    const code = units[0].tier2Code;

    await warmFakeGeo(request, ['10.1.1.1', '10.2.1.1']);
    await verifyCode(request, code, '10.1.1.1');
    await verifyCode(request, code, '10.2.1.1');

    const anomaly = await waitForAnomaly(request, {
      rule: 'duplicate_first',
      unitId: units[0].id,
    });
    expect(anomaly.score).toBe(80);

    await loginAs(page, 'owner');
    await page.goto(`/anomalies/${anomaly.id}`);
    await expect(page.getByText('Lagos')).toBeVisible();
    await expect(page.getByText('Kano')).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/\blat\b|\blng\b|\blon\b|latitude|longitude/i);
  });
});
