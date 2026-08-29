/**
 * Key management for HMAC signing with key versioning.
 *
 * KeyRing is the interface; StaticKeyRing parses CORE_KEYS and CORE_ACTIVE_KID
 * from environment-style strings for local/dev use.
 */

import crypto from 'node:crypto';

export interface KeyRing {
  /** Returns the currently active key (kid + secret bytes). */
  active(): { kid: string; secret: Uint8Array };
  /** Returns the secret for a given kid, or undefined if unknown. */
  get(kid: string): Uint8Array | undefined;
}

/**
 * Static key ring built from env-style configuration.
 *
 * Format:
 *   CORE_KEYS="k1:hexsecret,k2:hexsecret"
 *   CORE_ACTIVE_KID="k2"
 *
 * If CORE_ACTIVE_KID is omitted, the first key is active.
 */
export class StaticKeyRing implements KeyRing {
  private readonly keys: Map<string, Uint8Array>;
  private readonly activeKid: string;

  constructor(coreKeys: string, coreActiveKid?: string) {
    this.keys = new Map();

    const pairs = coreKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (pairs.length === 0) {
      throw new Error('StaticKeyRing: CORE_KEYS must contain at least one key');
    }

    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(
          `StaticKeyRing: invalid key format "${pair}", expected "kid:hexsecret"`,
        );
      }
      const kid = pair.slice(0, colonIdx).trim();
      const hex = pair.slice(colonIdx + 1).trim();
      if (!kid) {
        throw new Error(`StaticKeyRing: empty kid in key pair "${pair}"`);
      }
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error(`StaticKeyRing: invalid hex secret for kid "${kid}"`);
      }
      this.keys.set(kid, Buffer.from(hex, 'hex'));
    }

    this.activeKid =
      coreActiveKid ?? pairs[0].slice(0, pairs[0].indexOf(':')).trim();

    if (!this.keys.has(this.activeKid)) {
      throw new Error(
        `StaticKeyRing: CORE_ACTIVE_KID "${this.activeKid}" not found in CORE_KEYS`,
      );
    }
  }

  active(): { kid: string; secret: Uint8Array } {
    const secret = this.keys.get(this.activeKid)!;
    return { kid: this.activeKid, secret: new Uint8Array(secret) };
  }

  get(kid: string): Uint8Array | undefined {
    const secret = this.keys.get(kid);
    return secret ? new Uint8Array(secret) : undefined;
  }
}

/**
 * Compute HMAC-SHA256 of a message with the given key bytes, returning a Buffer.
 */
export function hmacSha256(key: Uint8Array, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message).digest();
}
