/**
 * Mulberry32 — a fast 32-bit seeded PRNG.
 * Returns a function that produces floats in [0, 1).
 */
export function seededRng(seed: number): () => number {
  let state = seed | 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded integer picker: returns ints in [min, max] inclusive.
 */
export function seededInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array using the seeded RNG.
 */
export function seededPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[seededInt(rng, 0, arr.length - 1)];
}

/**
 * Create a weighted picker. Each entry is [item, weight].
 * Higher weight = more likely.
 */
export function seededWeightedPick<T>(
  rng: () => number,
  entries: Array<[T, number]>,
): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  // Fallback (floating point edge case)
  return entries[entries.length - 1][0];
}
