import type { APIRequestContext, Page } from '@playwright/test';

/**
 * E07 test helpers. Self-contained: mints its own batches and drives the
 * real login form, rather than depending on `db:seed:realistic` (which
 * doesn't generate units/scans/anomalies yet — see CROSS-EPIC-REQUESTS.md's
 * ask to E21) or an E11 `loginAs` fixture (not built yet either).
 *
 * These specs each mint+verify against the shared local stack's real rate
 * limiters (RATE_LIMIT_IP_PER_MIN etc.) — reliably green run serially or at
 * normal suite concurrency; running only this @e07 subset at very high
 * parallelism (e.g. 4+ workers, nothing else warming up the stack first)
 * can occasionally trip a limiter. Prefer `pnpm test:e2e` (the full suite,
 * default workers) or `--workers=1` for this subset alone over
 * `--grep '@e07'` at max parallelism.
 */

export const API_BASE = `http://localhost:${process.env.API_HOST_PORT ?? '4000'}`;
export const FAKE_GEO_BASE = `http://localhost:${process.env.FAKE_GEO_PORT ?? '4103'}`;

export const DEV_PASSWORD = 'Passw0rd!Passw0rd!';
export const SEEDED_TENANT_SLUG = 'ivoryglow';

export type Role = 'owner' | 'operator' | 'viewer';

export function seededEmail(role: Role): string {
  return `${role}@ivoryglow.local`;
}

/** Logs into web-admin's real login form as the given seeded role. */
export async function loginAs(page: Page, role: Role): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(seededEmail(role));
  await page.getByRole('textbox', { name: 'Password*' }).fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/login'));
}

async function login(
  request: APIRequestContext,
  role: Role,
): Promise<{ accessToken: string; tenantId: string }> {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: seededEmail(role), password: DEV_PASSWORD },
  });
  const body = await res.json();
  return { accessToken: body.accessToken, tenantId: body.activeTenantId };
}

export interface MintedUnit {
  id: string;
  serial: number;
  tier1Code: string;
  tier2Code: string;
}

export interface MintedBatch {
  batchId: string;
  units: MintedUnit[];
}

/**
 * Mints a fresh batch of `count` units as the seeded owner, marks it
 * `shipped` (so dead_code doesn't spuriously fire in tests exercising other
 * rules), and returns its units with decrypted tier-2 codes — the only way
 * to get those back for an already-minted batch (never returned by any
 * other route; read via the dev-only manifest-reveal route).
 */
async function waitForBatchMinted(
  request: APIRequestContext,
  tenantId: string,
  authHeaders: Record<string, string>,
  batchId: string,
  timeoutMs = 20_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const current = await request
      .get(`${API_BASE}/tenants/${tenantId}/batches/${batchId}`, {
        headers: authHeaders,
      })
      .then((r) => r.json());
    if (current.status === 'minted') return;
    if (current.status === 'failed') {
      throw new Error(
        `mintTestBatch: batch ${batchId} failed to mint: ${current.failedReason ?? 'unknown reason'}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `mintTestBatch: batch ${batchId} did not reach 'minted' within ${timeoutMs}ms`,
  );
}

export async function mintTestBatch(
  request: APIRequestContext,
  count: number,
  idempotencyKey: string,
): Promise<MintedBatch> {
  const { accessToken, tenantId } = await login(request, 'owner');
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  for (const kind of ['aup', 'tos'] as const) {
    const current = await request
      .get(`${API_BASE}/policies/${kind}/current`)
      .then((r) => r.json());
    await request.post(`${API_BASE}/tenants/${tenantId}/policies/accept`, {
      headers: authHeaders,
      data: { kind, version: current.version },
    });
  }

  const products = await request
    .get(`${API_BASE}/tenants/${tenantId}/products`, { headers: authHeaders })
    .then((r) => r.json());
  const oems = await request
    .get(`${API_BASE}/tenants/${tenantId}/oems`, { headers: authHeaders })
    .then((r) => r.json());

  const batch = await request
    .post(`${API_BASE}/tenants/${tenantId}/batches`, {
      headers: authHeaders,
      data: {
        productId: products[0].id,
        oemId: oems[0].id,
        count,
        idempotencyKey,
      },
    })
    .then((r) => r.json());

  // MintService mints via a BullMQ job (api-worker); batches under MINT_SYNC_MAX
  // (5000, `count` here is always far below that) mint inline before the POST
  // resolves, but that's an internal sizing detail, not a contract — reading
  // units or navigating to a unit's page before the batch is truly `minted`
  // would otherwise race the worker (unit rows/detail data aren't there yet:
  // "Couldn't load this unit"). Poll for real completion rather than assume it.
  await waitForBatchMinted(request, tenantId, authHeaders, batch.id);

  await setBatchStatus(request, batch.id, 'shipped');

  const unitsPage = await request
    .get(
      `${API_BASE}/tenants/${tenantId}/batches/${batch.id}/units?limit=${count}`,
      {
        headers: authHeaders,
      },
    )
    .then((r) => r.json());

  const manifest = await request
    .get(`${API_BASE}/v1/_dev/anomaly/manifest/${batch.id}`)
    .then((r) => r.json());
  const tier2ByTier1 = new Map<string, string>(
    (manifest.units as Array<{ tier1Code: string; tier2Code: string }>).map(
      (u) => [u.tier1Code, u.tier2Code],
    ),
  );

  return {
    batchId: batch.id as string,
    units: unitsPage
      .map((u: { id: string; serial: number; tier1Code: string }) => ({
        id: u.id,
        serial: u.serial,
        tier1Code: u.tier1Code,
        tier2Code: tier2ByTier1.get(u.tier1Code) ?? '',
      }))
      .sort((a: MintedUnit, b: MintedUnit) => a.serial - b.serial),
  };
}

export async function setBatchStatus(
  request: APIRequestContext,
  batchId: string,
  status: string,
  expectedShipDate?: string,
): Promise<void> {
  await request.post(`${API_BASE}/v1/_dev/anomaly/set-batch-status`, {
    data: { batchId, status, expectedShipDate },
  });
}

export async function verifyCode(
  request: APIRequestContext,
  code: string,
  ip: string,
): Promise<{ verdict: string }> {
  const res = await request.get(`${API_BASE}/v1/verify/${code}`, {
    headers: { 'X-Forwarded-For': ip },
  });
  return res.json();
}

/** fake-geo's first lookup after being idle can exceed the 50ms timeout
 * HttpFakeGeoIp enforces — warm the specific IPs a test is about to use. */
export async function warmFakeGeo(
  request: APIRequestContext,
  ips: string[],
): Promise<void> {
  for (const ip of ips) {
    await request
      .get(`${FAKE_GEO_BASE}/lookup?ip=${ip}`)
      .catch(() => undefined);
  }
}

export async function getAnomalies(
  request: APIRequestContext,
  role: Role,
  query: Record<string, string>,
): Promise<{ items: Array<Record<string, unknown>> }> {
  const { accessToken } = await login(request, role);
  const qs = new URLSearchParams(query).toString();
  const res = await request.get(`${API_BASE}/v1/anomalies?${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/** Anomaly evaluation runs off a BullMQ job, not the request path — poll
 * until the expected anomaly shows up instead of a fixed sleep. */
export async function waitForAnomaly(
  request: APIRequestContext,
  query: Record<string, string>,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { items } = await getAnomalies(request, 'owner', query);
    if (items.length > 0) return items[0];
    if (Date.now() > deadline) {
      throw new Error(
        `no anomaly matching ${JSON.stringify(query)} within ${timeoutMs}ms`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
