import { describe, it, expect } from 'vitest';
import {
  seededRng,
  seededInt,
  seededPick,
  seededWeightedPick,
} from './seeded-rng';

describe('seededRng', () => {
  it('produces deterministic values for a given seed', () => {
    const rng1 = seededRng(42);
    const rng2 = seededRng(42);
    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = seededRng(42);
    const rng2 = seededRng(99);
    const val1 = rng1();
    const val2 = rng2();
    expect(val1).not.toEqual(val2);
  });

  it('produces values in [0, 1)', () => {
    const rng = seededRng(12345);
    for (let i = 0; i < 10_000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe('seededInt', () => {
  it('produces integers within [min, max]', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 10_000; i++) {
      const val = seededInt(rng, 1, 10);
      expect(Number.isInteger(val)).toBe(true);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
    }
  });
});

describe('seededPick', () => {
  it('picks elements from the array', () => {
    const rng = seededRng(42);
    const arr = ['a', 'b', 'c'];
    const pick = seededPick(rng, arr);
    expect(arr).toContain(pick);
  });

  it('is deterministic', () => {
    const pick1 = seededPick(seededRng(42), ['a', 'b', 'c']);
    const pick2 = seededPick(seededRng(42), ['a', 'b', 'c']);
    expect(pick1).toEqual(pick2);
  });
});

describe('seededWeightedPick', () => {
  it('picks from weighted entries', () => {
    const rng = seededRng(42);
    const entries: Array<[string, number]> = [
      ['heavy', 100],
      ['light', 1],
    ];
    const pick = seededWeightedPick(rng, entries);
    expect(['heavy', 'light']).toContain(pick);
  });

  it('heavily favors high-weight items in aggregate', () => {
    const rng = seededRng(42);
    const entries: Array<[string, number]> = [
      ['heavy', 99],
      ['light', 1],
    ];
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 10_000; i++) {
      counts[seededWeightedPick(rng, entries)]++;
    }
    expect(counts.heavy).toBeGreaterThan(counts.light * 10);
  });
});
