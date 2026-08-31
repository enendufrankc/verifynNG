import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from './client.js';

// Runs against a live `docker compose up` stack — see AC5:
// `createClient({ apiKey, baseUrl }).batches.list()` returns typed data.
// Requires the default `pnpm db:seed` fixtures (ivoryglow owner).
const API_BASE = `http://localhost:${process.env.API_HOST_PORT ?? '4000'}`;
const DEV_PASSWORD = 'Passw0rd!Passw0rd!';

async function createTestApiKey(): Promise<string> {
  const login = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@ivoryglow.local',
      password: DEV_PASSWORD,
    }),
  });
  if (!login.ok) {
    throw new Error(
      `login failed (${login.status}) — is docker compose up with the default seed?`,
    );
  }
  const { accessToken, activeTenantId } = (await login.json()) as {
    accessToken: string;
    activeTenantId: string;
  };

  const created = await fetch(
    `${API_BASE}/tenants/${activeTenantId}/api-keys`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: `sdk-compose-smoke-${Date.now()}`,
        scopes: ['read:batches', 'read:units', 'read:scans', 'read:reports'],
        mode: 'test',
      }),
    },
  );
  if (!created.ok) {
    throw new Error(`api key creation failed (${created.status})`);
  }
  const { key } = (await created.json()) as { key: string };
  return key;
}

describe('SDK compose smoke test', () => {
  let apiKey: string;

  beforeAll(async () => {
    apiKey = await createTestApiKey();
  }, 30_000);

  it('lists batches with typed data via a real API key', async () => {
    const client = createClient({ apiKey, baseUrl: API_BASE });
    const page = await client.batches.list({ limit: 5 });

    expect(Array.isArray(page.data)).toBe(true);
    expect(page).toHaveProperty('nextCursor');
    if (page.data.length > 0) {
      // Type-level check: these fields only exist if types.gen.ts is in
      // sync with the live spec.
      const [batch] = page.data;
      expect(typeof batch.id).toBe('string');
      expect(typeof batch.status).toBe('string');
    }
  });

  it('me returns the key scopes and rate limit', async () => {
    const client = createClient({ apiKey, baseUrl: API_BASE });
    const me = await client.me();

    expect(me.tenantId).toBeTruthy();
    expect(Array.isArray(me.scopes)).toBe(true);
    expect(me.rateLimit).toHaveProperty('perMinute');
  });
});
