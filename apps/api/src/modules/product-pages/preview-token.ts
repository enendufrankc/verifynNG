import { createHmac, timingSafeEqual } from 'node:crypto';

export const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Short-lived signed token for the draft preview, scoped to one page id. */
export function signPreviewToken(
  productPageId: string,
  secret: string,
  now: number = Date.now(),
): string {
  const expiresAt = now + PREVIEW_TOKEN_TTL_MS;
  const payload = `${productPageId}.${expiresAt}`;
  return Buffer.from(`${payload}.${sign(payload, secret)}`).toString(
    'base64url',
  );
}

export function verifyPreviewToken(
  token: string,
  productPageId: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const parts = decoded.split('.');
  if (parts.length !== 3) return false;
  const [tokenPageId, expiresAtRaw, signature] = parts;
  if (tokenPageId !== productPageId) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;

  const expected = Buffer.from(
    sign(`${tokenPageId}.${expiresAtRaw}`, secret),
    'hex',
  );
  const actual = Buffer.from(signature, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
