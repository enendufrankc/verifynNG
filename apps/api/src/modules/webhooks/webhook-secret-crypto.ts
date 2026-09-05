import crypto from 'node:crypto';
import { loadEnv } from '@verifynng/config';

// AES-256-GCM, layout [iv(12) | tag(16) | ciphertext] — same convention as
// ManifestService (apps/api/src/modules/batches/manifest.service.ts),
// base64-encoded for storage in the `secretEnc` String column.

export function encryptWebhookSecret(plaintext: string): string {
  const key = Buffer.from(loadEnv().WEBHOOK_SECRET_ENC_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptWebhookSecret(secretEnc: string): string {
  const key = Buffer.from(loadEnv().WEBHOOK_SECRET_ENC_KEY, 'hex');
  const payload = Buffer.from(secretEnc, 'base64');
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
