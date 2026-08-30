import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { signManifest, verifyManifest, StaticKeyRing } from '@verifynng/core';

const CORE_KEYS =
  'k1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ring = new StaticKeyRing(CORE_KEYS, 'k1');

describe('Manifest encryption', () => {
  it('encrypts and decrypts correctly (round-trip)', () => {
    const key = Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'hex',
    );
    const iv = crypto.randomBytes(12);
    const manifest = { version: 2, test: true };
    const signed = signManifest(ring, manifest);
    const json = JSON.stringify(signed);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, encrypted]);

    const dIv = payload.subarray(0, 12);
    const dTag = payload.subarray(12, 28);
    const dCiphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, dIv);
    decipher.setAuthTag(dTag);
    const decrypted = Buffer.concat([
      decipher.update(dCiphertext),
      decipher.final(),
    ]);
    const result = JSON.parse(decrypted.toString('utf8'));

    expect(verifyManifest(ring, result)).toBe(true);
  });

  it('tampered ciphertext fails GCM auth', () => {
    const key = Buffer.from(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      'hex',
    );
    const iv = crypto.randomBytes(12);
    const json = JSON.stringify({ test: true });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Tamper with the ciphertext
    const tampered = Buffer.from(encrypted);
    tampered[0] ^= 0xff;
    const payload = Buffer.concat([iv, tag, tampered]);

    const dIv = payload.subarray(0, 12);
    const dTag = payload.subarray(12, 28);
    const dCiphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, dIv);
    decipher.setAuthTag(dTag);

    expect(() => {
      Buffer.concat([decipher.update(dCiphertext), decipher.final()]);
    }).toThrow();
  });
});
