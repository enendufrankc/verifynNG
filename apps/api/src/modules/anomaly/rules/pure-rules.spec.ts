import { describe, expect, it } from 'vitest';
import {
  evaluateDeadCode,
  evaluateDuplicateFirst,
  evaluateGeoDispersion,
  evaluatePreReveal,
  evaluateVelocity,
} from './pure-rules';

const NOW = new Date('2026-08-30T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const minsAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

describe('evaluateGeoDispersion', () => {
  it('fires once distinct cities reach the threshold within the window', () => {
    const scans = [
      {
        scanEventId: 's1',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: daysAgo(3),
      },
      {
        scanEventId: 's2',
        geoCity: 'Accra',
        geoCountry: 'GH',
        createdAt: daysAgo(2),
      },
      {
        scanEventId: 's3',
        geoCity: 'Nairobi',
        geoCountry: 'KE',
        createdAt: daysAgo(1),
      },
    ];
    const result = evaluateGeoDispersion(
      scans,
      { distinctCities: 3, windowDays: 7 },
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result!.cities.map((c) => c.city)).toEqual([
      'Lagos',
      'Accra',
      'Nairobi',
    ]);
  });

  it('does not fire below the threshold', () => {
    const scans = [
      {
        scanEventId: 's1',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: daysAgo(3),
      },
      {
        scanEventId: 's2',
        geoCity: 'Accra',
        geoCountry: 'GH',
        createdAt: daysAgo(2),
      },
    ];
    expect(
      evaluateGeoDispersion(scans, { distinctCities: 3, windowDays: 7 }, NOW),
    ).toBeNull();
  });

  it('ignores scans outside the window', () => {
    const scans = [
      {
        scanEventId: 's1',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: daysAgo(30),
      },
      {
        scanEventId: 's2',
        geoCity: 'Accra',
        geoCountry: 'GH',
        createdAt: daysAgo(2),
      },
      {
        scanEventId: 's3',
        geoCity: 'Nairobi',
        geoCountry: 'KE',
        createdAt: daysAgo(1),
      },
    ];
    expect(
      evaluateGeoDispersion(scans, { distinctCities: 3, windowDays: 7 }, NOW),
    ).toBeNull();
  });

  it('does not double count repeated cities', () => {
    const scans = [
      {
        scanEventId: 's1',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: daysAgo(3),
      },
      {
        scanEventId: 's2',
        geoCity: 'Lagos',
        geoCountry: 'NG',
        createdAt: daysAgo(2),
      },
      {
        scanEventId: 's3',
        geoCity: 'Accra',
        geoCountry: 'GH',
        createdAt: daysAgo(1),
      },
    ];
    expect(
      evaluateGeoDispersion(scans, { distinctCities: 3, windowDays: 7 }, NOW),
    ).toBeNull();
  });
});

describe('evaluateVelocity', () => {
  const thresholds = { distinctUnits: 3, windowMinutes: 10 };

  it('fires once distinct units reach the threshold within the window', () => {
    const scans = [
      { scanEventId: 'e1', unitId: 'u1', batchId: 'b1', createdAt: minsAgo(5) },
      { scanEventId: 'e2', unitId: 'u2', batchId: 'b1', createdAt: minsAgo(4) },
      { scanEventId: 'e3', unitId: 'u3', batchId: 'b1', createdAt: minsAgo(3) },
    ];
    const result = evaluateVelocity(scans, thresholds, NOW);
    expect(result).toEqual({
      distinctUnitCount: 3,
      unitIds: ['u1', 'u2', 'u3'],
      batchId: 'b1',
    });
  });

  it('is tenant-scoped (batchId null) when units span multiple batches', () => {
    const scans = [
      { scanEventId: 'e1', unitId: 'u1', batchId: 'b1', createdAt: minsAgo(5) },
      { scanEventId: 'e2', unitId: 'u2', batchId: 'b2', createdAt: minsAgo(4) },
      { scanEventId: 'e3', unitId: 'u3', batchId: 'b1', createdAt: minsAgo(3) },
    ];
    const result = evaluateVelocity(scans, thresholds, NOW);
    expect(result?.batchId).toBeNull();
  });

  it('does not fire below the threshold', () => {
    const scans = [
      { scanEventId: 'e1', unitId: 'u1', batchId: 'b1', createdAt: minsAgo(5) },
      { scanEventId: 'e2', unitId: 'u2', batchId: 'b1', createdAt: minsAgo(4) },
    ];
    expect(evaluateVelocity(scans, thresholds, NOW)).toBeNull();
  });

  it('ignores scans outside the window', () => {
    const scans = [
      {
        scanEventId: 'e1',
        unitId: 'u1',
        batchId: 'b1',
        createdAt: minsAgo(60),
      },
      { scanEventId: 'e2', unitId: 'u2', batchId: 'b1', createdAt: minsAgo(4) },
      { scanEventId: 'e3', unitId: 'u3', batchId: 'b1', createdAt: minsAgo(3) },
    ];
    expect(evaluateVelocity(scans, thresholds, NOW)).toBeNull();
  });
});

describe('evaluateDeadCode', () => {
  it('fires for tier-2 scans on a non-shipped batch', () => {
    expect(evaluateDeadCode('tier2', 'delivered')).toBe(true);
  });

  it('does not fire once the batch has shipped', () => {
    expect(evaluateDeadCode('tier2', 'shipped')).toBe(false);
  });

  it('does not fire once the batch is closed', () => {
    expect(evaluateDeadCode('tier2', 'closed')).toBe(false);
  });

  it('never fires for tier-1 scans', () => {
    expect(evaluateDeadCode('tier1', 'delivered')).toBe(false);
  });
});

describe('evaluatePreReveal', () => {
  const thresholds = { graceDays: 0 };

  it('fires when scanned before the expected ship date', () => {
    const shipDate = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(evaluatePreReveal('tier2', NOW, shipDate, thresholds)).toBe(true);
  });

  it('does not fire once past the expected ship date', () => {
    const shipDate = new Date(NOW.getTime() - 1 * 86_400_000);
    expect(evaluatePreReveal('tier2', NOW, shipDate, thresholds)).toBe(false);
  });

  it('never fires when expectedShipDate is unset (stub until E05 ships it)', () => {
    expect(evaluatePreReveal('tier2', NOW, null, thresholds)).toBe(false);
  });

  it('never fires for tier-1 scans', () => {
    const shipDate = new Date(NOW.getTime() + 7 * 86_400_000);
    expect(evaluatePreReveal('tier1', NOW, shipDate, thresholds)).toBe(false);
  });

  it('respects the grace period', () => {
    const shipDate = new Date(NOW.getTime() + 1 * 86_400_000);
    expect(evaluatePreReveal('tier2', NOW, shipDate, { graceDays: 2 })).toBe(
      false,
    );
  });
});

describe('evaluateDuplicateFirst', () => {
  const thresholds = { windowMinutes: 30, minDistanceKm: 200 };

  it('fires for two scans within the window from cities far enough apart', () => {
    const current = { scanEventId: 'c', geoCity: 'Kano', createdAt: NOW };
    const previous = {
      scanEventId: 'p',
      geoCity: 'Lagos',
      createdAt: minsAgo(2),
    };
    const result = evaluateDuplicateFirst(current, previous, thresholds);
    expect(result).not.toBeNull();
    expect(result!.distanceKm).toBeGreaterThan(200);
  });

  it('does not fire with no previous scan', () => {
    const current = { scanEventId: 'c', geoCity: 'Kano', createdAt: NOW };
    expect(evaluateDuplicateFirst(current, null, thresholds)).toBeNull();
  });

  it('does not fire outside the window', () => {
    const current = { scanEventId: 'c', geoCity: 'Kano', createdAt: NOW };
    const previous = {
      scanEventId: 'p',
      geoCity: 'Lagos',
      createdAt: minsAgo(45),
    };
    expect(evaluateDuplicateFirst(current, previous, thresholds)).toBeNull();
  });

  it('does not fire for cities under the distance threshold', () => {
    const current = { scanEventId: 'c', geoCity: 'Lagos', createdAt: NOW };
    const previous = {
      scanEventId: 'p',
      geoCity: 'Lagos',
      createdAt: minsAgo(2),
    };
    expect(evaluateDuplicateFirst(current, previous, thresholds)).toBeNull();
  });

  it('does not fire for a city missing from the centroid table', () => {
    const current = { scanEventId: 'c', geoCity: 'Atlantis', createdAt: NOW };
    const previous = {
      scanEventId: 'p',
      geoCity: 'Lagos',
      createdAt: minsAgo(2),
    };
    expect(evaluateDuplicateFirst(current, previous, thresholds)).toBeNull();
  });
});
