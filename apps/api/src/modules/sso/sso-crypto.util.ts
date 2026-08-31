import crypto from 'node:crypto';

/**
 * AES-256-GCM encrypt/decrypt for `TenantSsoConfig.clientSecretEnc`, keyed by
 * `SSO_CLIENT_SECRET_ENC_KEY`. Same construction as E02's MfaService (no
 * shared `SecretsHelper.encrypt/decrypt` exists in the codebase yet — E13's
 * SecretsModule only exposes `SecretsPort.get()` for reading configured
 * secrets and `SecretsKeyRing` for the core signing keys).
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
