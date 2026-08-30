import { describe, it, expect, vi } from 'vitest';
import {
  generateReferenceCandidate,
  generateUniqueReference,
} from './reference.util';

describe('generateReferenceCandidate', () => {
  it('matches RPT-XXXXXX with Crockford base32 chars', () => {
    expect(generateReferenceCandidate()).toMatch(/^RPT-[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});

describe('generateUniqueReference', () => {
  it('retries on collision until a free candidate is found', async () => {
    let calls = 0;
    const exists = vi.fn(async () => {
      calls++;
      return calls < 3;
    });
    const ref = await generateUniqueReference(exists);
    expect(exists).toHaveBeenCalledTimes(3);
    expect(ref).toMatch(/^RPT-/);
  });

  it('throws after maxAttempts collisions', async () => {
    await expect(generateUniqueReference(async () => true, 3)).rejects.toThrow(
      'reference_generation_exhausted',
    );
  });
});
