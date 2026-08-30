import type { APIRequestContext } from '@playwright/test';

// Per-worktree API port: scripts/epic writes NEXT_PUBLIC_API_URL into .env
// (loaded by playwright.config.ts), same variable the web apps use to reach
// the API. There is no separate API_URL convention elsewhere in this repo's
// fixtures — this mirrors the one that already exists.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function seedReports(
  request: APIRequestContext,
  tenantSlug = 'ivoryglow',
): Promise<void> {
  const res = await request.post(`${API_URL}/v1/_dev/reports/seed`, {
    data: { tenantSlug },
  });
  if (!res.ok()) throw new Error(`seed failed: ${res.status()}`);
}
