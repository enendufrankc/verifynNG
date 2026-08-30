import { test, expect } from '@playwright/test';
import path from 'node:path';

const fakeVideoPath = path.join(__dirname, 'fixtures', 'qr-tier2.y4m');

// This code is minted with the platform's default dev signing key
// (CORE_KEYS default in packages/config/src/env-schema.ts) baked into
// tests/e2e/fixtures/qr-tier2.y4m at build time — see the git history of
// that fixture for the exact generation script. It has a valid checksum
// but no Unit row anywhere, so it deterministically renders `unknown`
// regardless of what this worktree's own fixture seeding creates.
const EXPECTED_CODE = 'ivoryglow.2.k1.SCANQ90DTW7HQEXPFF61.1YNHKC59';

test.use({
  launchOptions: {
    args: [
      // Both flags are required together — fake-device alone throws
      // NotSupportedError from getUserMedia (confirmed by hand before
      // adding this one).
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${fakeVideoPath}`,
    ],
  },
});

test.describe('E09 camera scanner @e09', () => {
  test('scans a QR code and lands on the corresponding verdict page', async ({
    context,
    page,
  }) => {
    await context.grantPermissions(['camera']);
    await page.goto('/verify');
    await page.getByRole('button', { name: /scan with camera/i }).click();
    await page.waitForURL(
      new RegExp(`/v/${EXPECTED_CODE.replace(/\./g, '\\.')}`),
      {
        timeout: 15_000,
      },
    );
    await expect(page.locator('h1')).toHaveText('Not recognised');
  });
});
