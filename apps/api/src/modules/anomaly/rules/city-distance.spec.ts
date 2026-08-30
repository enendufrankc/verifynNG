import { describe, expect, it } from 'vitest';
import { cityDistanceKm } from './city-distance';

describe('cityDistanceKm', () => {
  it('returns a plausible distance between two known cities', () => {
    const km = cityDistanceKm('Lagos', 'Kano');
    expect(km).not.toBeNull();
    expect(km!).toBeGreaterThan(700);
    expect(km!).toBeLessThan(900);
  });

  it('is symmetric', () => {
    expect(cityDistanceKm('Lagos', 'Accra')).toBeCloseTo(
      cityDistanceKm('Accra', 'Lagos')!,
      5,
    );
  });

  it('returns null for the same city', () => {
    expect(cityDistanceKm('Lagos', 'Lagos')).toBeNull();
  });

  it('returns null when a city is missing from the table', () => {
    expect(cityDistanceKm('Lagos', 'Atlantis')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(cityDistanceKm('', 'Lagos')).toBeNull();
  });
});
