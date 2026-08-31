import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadEnv } from '@verifynng/config';

/**
 * AES-256-GCM at rest for PaymentMethod.authorizationCode (schema.prisma's
 * comment: "encrypted at rest via E13 secrets helper"). No such shared
 * helper actually exists in this codebase (checked apps/api/src/modules/
 * secrets/ — SecretsPort reads config secrets, SecretsKeyRing hands back
 * HMAC key material for E01's verify-code signing) — mirrors MfaService's
 * own dedicated-key AES-256-GCM pattern (apps/api/src/modules/auth/
 * services/mfa.service.ts) instead of reusing a key meant for a different
 * cryptographic purpose or building a new shared helper inside E13's
 * owned module.
 */
@Injectable()
export class PaymentMethodCipher {
  private readonly key: Buffer;

  constructor() {
    this.key = Buffer.from(loadEnv().BILLING_PAYMENT_METHOD_ENC_KEY, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
