import crypto from 'node:crypto';

/**
 * AES-256-GCM envelope matching E04's ManifestService: [iv(12) | tag(16) | ciphertext].
 * Duplicated here (rather than imported) because E04's helper is private to
 * ManifestService — the layout is a two-line contract, not worth a cross-epic export.
 */
export function encryptManifest(json: string, encKeyHex: string): Buffer {
  const key = Buffer.from(encKeyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptManifest(payload: Buffer, encKeyHex: string): string {
  const key = Buffer.from(encKeyHex, 'hex');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/** Timing-safe equality for token/hash comparisons. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
