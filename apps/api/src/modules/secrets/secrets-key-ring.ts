/**
 * SecretsKeyRing — implements @verifynng/core KeyRing using CORE_KEYS_JSON.
 *
 * Reads the JSON format: { "active": "k2", "keys": { "k1": "<hex>", "k2": "<hex>" } }
 * Falls back to E01's legacy format: CORE_KEYS="k1:hex,k2:hex" + CORE_ACTIVE_KID="k2"
 */

import { Injectable, Logger } from '@nestjs/common';
import type { KeyRing } from '@verifynng/core';

interface CoreKeysJson {
  active: string;
  keys: Record<string, string>;
}

@Injectable()
export class SecretsKeyRing implements KeyRing {
  private readonly logger = new Logger(SecretsKeyRing.name);
  private readonly keys: Map<string, Uint8Array>;
  private readonly activeKid: string;

  constructor(
    coreKeysJson: string,
    legacyCoreKeys?: string,
    legacyActiveKid?: string,
  ) {
    // Try JSON format first
    try {
      const parsed: CoreKeysJson = JSON.parse(coreKeysJson);
      this.keys = new Map();
      for (const [kid, hex] of Object.entries(parsed.keys)) {
        if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
          throw new Error(`Invalid hex secret for kid "${kid}"`);
        }
        this.keys.set(kid, Buffer.from(hex, 'hex'));
      }
      this.activeKid = parsed.active;

      if (!this.keys.has(this.activeKid)) {
        throw new Error(
          `SecretsKeyRing: active kid "${this.activeKid}" not found in keys`,
        );
      }

      this.logger.log(
        `Loaded ${this.keys.size} keys, active: ${this.activeKid}`,
      );
      return;
    } catch (err: any) {
      if (!legacyCoreKeys) {
        throw new Error(
          `Failed to parse CORE_KEYS_JSON and no CORE_KEYS fallback: ${err.message}`,
        );
      }
    }

    // Fallback to legacy format
    this.logger.warn('Falling back to legacy CORE_KEYS format');
    this.keys = new Map();
    const pairs = legacyCoreKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(`Invalid key format "${pair}"`);
      }
      const kid = pair.slice(0, colonIdx).trim();
      const hex = pair.slice(colonIdx + 1).trim();
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
        throw new Error(`Invalid hex secret for kid "${kid}"`);
      }
      this.keys.set(kid, Buffer.from(hex, 'hex'));
    }

    this.activeKid =
      legacyActiveKid ?? pairs[0].slice(0, pairs[0].indexOf(':')).trim();

    if (!this.keys.has(this.activeKid)) {
      throw new Error(
        `SecretsKeyRing: active kid "${this.activeKid}" not found in keys`,
      );
    }

    this.logger.log(
      `Loaded ${this.keys.size} keys (legacy), active: ${this.activeKid}`,
    );
  }

  active(): { kid: string; secret: Uint8Array } {
    const secret = this.keys.get(this.activeKid)!;
    return { kid: this.activeKid, secret: new Uint8Array(secret) };
  }

  get(kid: string): Uint8Array | undefined {
    const secret = this.keys.get(kid);
    return secret ? new Uint8Array(secret) : undefined;
  }

  /** Return all kids (for dev endpoint) */
  getKids(): string[] {
    return Array.from(this.keys.keys());
  }

  /** Return the active kid (for dev endpoint) */
  getActiveKid(): string {
    return this.activeKid;
  }
}
