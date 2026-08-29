import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  TOTP,
  generateSecret,
  generateURI,
  verify,
} from 'otplib';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class MfaService {
  private readonly encKey: Buffer;
  private readonly totp: TOTP;

  constructor() {
    const env = loadEnv();
    this.encKey = Buffer.from(env.MFA_ENC_KEY, 'hex');
    this.totp = new TOTP({ step: 30, window: 1 });
  }

  generateSecret(email: string): {
    secret: string;
    otpauthUri: string;
    encrypted: string;
  } {
    const secret = generateSecret();
    const otpauthUri = generateURI({
      secret,
      accountName: email,
      issuer: 'VerifyNG',
    });
    const encrypted = this.encrypt(secret);
    return { secret, otpauthUri, encrypted };
  }

  verifyTotp(code: string, encryptedSecret: string): boolean {
    const secret = this.decrypt(encryptedSecret);
    return verify({ token: code, secret, step: 30, window: 1 });
  }

  generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const bytes = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${bytes.slice(0, 4)}-${bytes.slice(4)}`);
    }
    return codes;
  }

  async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(
      codes.map((c) =>
        argon2.hash(c, {
          type: 'argon2id' as any,
          memoryCost: 4096,
          timeCost: 1,
          parallelism: 1,
        }),
      ),
    );
  }

  async consumeRecoveryCode(
    code: string,
    hashedCodes: string[],
  ): Promise<{ valid: boolean; remaining: string[] }> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await argon2.verify(hashedCodes[i], code);
      if (match) {
        const remaining = [...hashedCodes];
        remaining.splice(i, 1);
        return { valid: true, remaining };
      }
    }
    return { valid: false, remaining: hashedCodes };
  }

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
