/**
 * Property tests for the code engine using fast-check.
 *
 * AC2: For 10,000 random (tenant, tier) inputs, verifyChecksum(generateCode(...)) is ok
 *      and any single-character mutation of the code fails.
 * AC3: normalizeCode makes parseCode accept lowercase, -separated and I/L/O-substituted
 *      transcriptions of any generated code.
 * AC5: A manifest signed with k1, mutated in any field, fails verifyManifest;
 *      receiptHash is identical for shuffled input orders.
 * AC6: Legacy codes from legacy/ verify when the legacy secret is loaded as kid=legacy.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateCode,
  verifyChecksum,
  computeLegacyChecksum,
} from '../src/code.js';
import { normalizeCode } from '../src/alphabet.js';
import { StaticKeyRing } from '../src/keys.js';
import { signManifest, verifyManifest, receiptHash } from '../src/manifest.js';
import type { Tier } from '../src/code.js';
import type { SignedManifest } from '../src/manifest.js';

const KEY_HEX =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const KEY_HEX_2 =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const LEGACY_HEX =
  'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

function makeRing(activeKid?: string) {
  return new StaticKeyRing(
    `k1:${KEY_HEX},k2:${KEY_HEX_2},legacy:${LEGACY_HEX}`,
    activeKid ?? 'k1',
  );
}

// Arbitrary for valid tenant slugs (lowercase alphanumeric, 2-20 chars)
const tenantArb = fc
  .stringOf(fc.char(), { minLength: 2, maxLength: 20 })
  .filter((s) => /^[a-z0-9]+$/.test(s));

// Arbitrary for tier
const tierArb: fc.Arbitrary<Tier> = fc.constantFrom(1, 2);

describe('AC2: verifyChecksum round-trip + single-char mutation', () => {
  it('verifyChecksum(generateCode(...)) is ok for 10,000 random inputs', () => {
    const ring = makeRing();
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ring, { tenant, tier });
        const result = verifyChecksum(ring, code);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.parsed.tenant).toBe(tenant.toLowerCase());
          expect(result.parsed.tier).toBe(tier);
        }
      }),
      { numRuns: 10_000 },
    );
  });

  it('any single-character mutation of the code fails verifyChecksum', () => {
    const ring = makeRing();
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ring, { tenant, tier });
        // Mutate each character position
        for (let i = 0; i < code.length; i++) {
          const original = code[i];
          // Skip dots — mutating them changes the segment structure
          if (original === '.') continue;
          // Pick a different character from the same set
          const charset = /\d/.test(original) ? '0123456789' : ALPHABET;
          const mutated =
            charset[(charset.indexOf(original) + 1) % charset.length];
          const tampered = code.slice(0, i) + mutated + code.slice(i + 1);
          const result = verifyChecksum(ring, tampered);
          expect(result.ok).toBe(false);
        }
      }),
      { numRuns: 1_000 },
    );
  });
});

describe('AC3: normalizeCode makes parseCode accept transcriptions', () => {
  it('lowercase transcription verifies', () => {
    const ring = makeRing();
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ring, { tenant, tier });
        const lower = code.toLowerCase();
        const normalized = normalizeCode(lower);
        const result = verifyChecksum(ring, normalized);
        expect(result.ok).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });

  it('hyphen-separated transcription normalizes and verifies', () => {
    const ring = makeRing();
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ring, { tenant, tier });
        // Insert hyphens between characters in the payload segment
        const parts = code.split('.');
        parts[3] = parts[3].split('').join('-'); // hyphenate payload
        const hyphenated = parts.join('.');
        const normalized = normalizeCode(hyphenated);
        const result = verifyChecksum(ring, normalized);
        expect(result.ok).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });

  it('I/L/O-substituted base32 segments verify', () => {
    const ring = makeRing();
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ring, { tenant, tier });
        // In the payload/checksum, replace some chars with their common confusions:
        // 1 → I or L, 0 → O
        const parts = code.split('.');
        // Substitute in payload (index 3) and checksum (index 4)
        let payload = parts[3];
        let checksum = parts[4];
        // Replace first '1' with 'I', first '0' with 'O'
        payload = payload.replace('1', 'I').replace('0', 'O');
        checksum = checksum.replace('1', 'L');
        const substituted = [
          parts[0],
          parts[1],
          parts[2],
          payload,
          checksum,
        ].join('.');
        const normalized = normalizeCode(substituted);
        const result = verifyChecksum(ring, normalized);
        expect(result.ok).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });
});

describe('T10: Key rotation', () => {
  it('codes generated under k1 still verify after k2 becomes active', () => {
    const ringK1 = makeRing('k1');
    const ringK2 = makeRing('k2');

    // Generate codes with k1 active
    const { code: code1 } = generateCode(ringK1, { tenant: 'test', tier: 2 });
    const { code: code2 } = generateCode(ringK1, { tenant: 'brand', tier: 1 });

    // k2 is now active — but k1 codes should still verify
    expect(verifyChecksum(ringK2, code1).ok).toBe(true);
    expect(verifyChecksum(ringK2, code2).ok).toBe(true);

    // k2 codes should also verify
    const { code: code3 } = generateCode(ringK2, { tenant: 'test', tier: 2 });
    expect(verifyChecksum(ringK2, code3).ok).toBe(true);
    expect(verifyChecksum(ringK1, code3).ok).toBe(true); // k1 ring still has k2
  });

  it('codes under unknown kid fail with reason', () => {
    // Ring with only k1
    const ring = new StaticKeyRing(`k1:${KEY_HEX}`, 'k1');
    // Code generated with k2 kid but ring only has k1
    const code = 'test.2.k2.ABCDEFGH1234567890AB.12345678';
    const result = verifyChecksum(ring, code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('unknown key id');
    }
  });

  it('key rotation property test: codes verify across key rotation', () => {
    const ringK1 = makeRing('k1');
    const ringK2 = makeRing('k2');

    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        const { code } = generateCode(ringK1, { tenant, tier });
        // After rotating to k2, the old k1 code should still verify
        const result = verifyChecksum(ringK2, code);
        expect(result.ok).toBe(true);
      }),
      { numRuns: 1_000 },
    );
  });
});

describe('AC5: Manifest mutation and receiptHash order-independence', () => {
  it('mutated manifest field fails verifyManifest (property)', () => {
    const ring = makeRing();
    fc.assert(
      fc.property(
        fc.record({
          batchId: fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          count: fc.integer({ min: 1, max: 1000 }),
        }),
        (data) => {
          const signed = signManifest(ring, data);
          // Mutate batchId
          const mutated: SignedManifest = {
            ...signed,
            batchId: data.batchId + 'X',
          };
          expect(verifyManifest(ring, mutated)).toBe(false);
          // Mutate count
          const mutatedCount: SignedManifest = {
            ...signed,
            count: data.count + 1,
          };
          expect(verifyManifest(ring, mutatedCount)).toBe(false);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('receiptHash is identical for shuffled input orders', () => {
    fc.assert(
      fc.property(
        fc.array(fc.hexaString({ minLength: 5, maxLength: 50 }), {
          minLength: 2,
          maxLength: 20,
        }),
        (codes) => {
          const hash1 = receiptHash(codes);
          const shuffled = [...codes].sort(() => Math.random() - 0.5);
          const hash2 = receiptHash(shuffled);
          expect(hash1).toBe(hash2);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

describe('AC6: Legacy codes verify with kid=legacy', () => {
  it('legacy format codes verify with the legacy key', () => {
    const ring = makeRing(); // has 'legacy' key
    fc.assert(
      fc.property(tenantArb, tierArb, (tenant, tier) => {
        // Generate a legacy-style code
        const payload = 'ABCDEFGH1234567890AB';
        const secret = Buffer.from(LEGACY_HEX, 'hex');
        const checksum = computeLegacyChecksum(
          new Uint8Array(secret),
          tenant,
          tier,
          payload,
        );
        const code = `${tenant}.${tier}.${payload}.${checksum}`;
        const result = verifyChecksum(ring, code);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.parsed.legacy).toBe(true);
          expect(result.parsed.kid).toBe('legacy');
        }
      }),
      { numRuns: 1_000 },
    );
  });
});
