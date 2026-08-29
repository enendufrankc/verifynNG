export {
  seededRng,
  seededInt,
  seededPick,
  seededWeightedPick,
} from '../../../../src/testing/seeded-rng.js';

/** Default seed for reproducibility */
export const DEFAULT_SEED = 42;

/** Anchor timestamp — all dates in the seed are relative to this */
export const SEED_NOW = new Date('2026-08-28T00:00:00Z');
