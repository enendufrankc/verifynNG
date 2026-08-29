import type { APIRequestContext } from '@playwright/test';

/**
 * TODO(E06): Uses E06's /v1/verify/:code endpoint. Currently a stub.
 */
export async function scanCode(
  _request: APIRequestContext,
  _code: string,
  _options?: { ip?: string; ua?: string },
): Promise<{ verdict: string; tier: number }> {
  // TODO(E06): call GET /v1/verify/:code with appropriate headers
  return { verdict: 'authentic', tier: 1 };
}
