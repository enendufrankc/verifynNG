import crypto from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** CSPRNG base62 string of the given length (rejection sampling — no modulo bias). */
export function randomBase62(length: number): string {
  const chars: string[] = [];
  while (chars.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && chars.length < length; i++) {
      const byte = bytes[i];
      // 248 = 4 * 62 — largest multiple of 62 <= 256, keeps the distribution uniform.
      if (byte < 248) chars.push(BASE62[byte % 62]);
    }
  }
  return chars.join('');
}

export type ApiKeyMode = 'live' | 'test';

/** vk_{live|test}_{32 base62 chars}. Prefix is the first 12 chars — "vk_live_XXXX" — safe to display. */
export function generateApiKey(mode: ApiKeyMode): {
  rawKey: string;
  prefix: string;
} {
  const rawKey = `vk_${mode}_${randomBase62(32)}`;
  return { rawKey, prefix: rawKey.slice(0, 12) };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}
