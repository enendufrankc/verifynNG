import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { loadEnv } from '@verifynng/config';

const TOTP_PERIOD = 30;
// ±1 time step of drift tolerance either side of the current period.
const TOTP_EPOCH_TOLERANCE: [number, number] = [TOTP_PERIOD, TOTP_PERIOD];

@Injectable()
export class MfaService {
  private readonly encKey: Buffer;

  constructor() {
    const env = loadEnv();
    this.encKey = Buffer.from(env.MFA_ENC_KEY, 'hex');
  }

  generateSecret(email: string): {
    secret: string;
    otpauthUri: string;
    encrypted: string;
  } {
    const secret = generateSecret();
    const otpauthUri = generateURI({
      secret,
      label: email,
      issuer: 'VerifyNG',
    });
    const encrypted = this.encrypt(secret);
    return { secret, otpauthUri, encrypted };
  }

  async verifyTotp(code: string, encryptedSecret: string): Promise<boolean> {
    const secret = this.decrypt(encryptedSecret);
    const result = await verify({
      token: code,
      secret,
      period: TOTP_PERIOD,
      epochTolerance: TOTP_EPOCH_TOLERANCE,
    });
    return result.valid;
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
          type: argon2.argon2id,
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
