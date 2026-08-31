import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, randomBase62 } from './key-generator.js';

describe('key-generator', () => {
  it('generateApiKey produces vk_{mode}_{32 base62 chars} with a 12-char prefix', () => {
    const { rawKey, prefix } = generateApiKey('live');
    expect(rawKey).toMatch(/^vk_live_[0-9A-Za-z]{32}$/);
    expect(prefix).toBe(rawKey.slice(0, 12));
    expect(prefix).toHaveLength(12);

    const test = generateApiKey('test');
    expect(test.rawKey).toMatch(/^vk_test_[0-9A-Za-z]{32}$/);
  });

  it('randomBase62 never repeats across many calls (CSPRNG, not deterministic)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomBase62(32)));
    expect(seen.size).toBe(200);
  });

  it('hashApiKey is deterministic and matches the known SHA-256 hex of a fixed input', () => {
    expect(hashApiKey('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
