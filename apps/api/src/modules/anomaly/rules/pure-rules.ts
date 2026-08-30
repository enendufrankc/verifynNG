import { cityDistanceKm } from './city-distance';

export interface CityScan {
  scanEventId: string;
  geoCity: string | null;
  geoCountry: string | null;
  createdAt: Date;
}

export interface GeoDispersionResult {
  cities: Array<{
    scanEventId: string;
    city: string;
    country: string | null;
    at: Date;
  }>;
}

/**
 * True when a unit's tier-2 code was scanned from `distinctCities` or more
 * distinct cities within the trailing `windowDays`.
 */
export function evaluateGeoDispersion(
  scans: CityScan[],
  thresholds: { distinctCities: number; windowDays: number },
  now: Date,
): GeoDispersionResult | null {
  const windowStart = new Date(
    now.getTime() - thresholds.windowDays * 86_400_000,
  );
  const inWindow = scans.filter((s) => s.geoCity && s.createdAt >= windowStart);

  const seenCities = new Set<string>();
  const cities: GeoDispersionResult['cities'] = [];
  for (const s of inWindow) {
    if (!s.geoCity || seenCities.has(s.geoCity)) continue;
    seenCities.add(s.geoCity);
    cities.push({
      scanEventId: s.scanEventId,
      city: s.geoCity,
      country: s.geoCountry,
      at: s.createdAt,
    });
  }

  if (seenCities.size < thresholds.distinctCities) return null;
  return { cities };
}

export interface VelocityScan {
  scanEventId: string;
  unitId: string | null;
  batchId: string | null;
  createdAt: Date;
}

export interface VelocityResult {
  distinctUnitCount: number;
  unitIds: string[];
  /** Set only when every scanned unit shares one batch. */
  batchId: string | null;
}

/**
 * True when one IP hash verified `distinctUnits` or more distinct units
 * within `windowMinutes`. Velocity anomalies never carry a single `unitId`
 * (there is no one unit to flag) — only a `batchId` when every unit scanned
 * shares one batch, otherwise the anomaly is tenant-scoped.
 */
export function evaluateVelocity(
  scans: VelocityScan[],
  thresholds: { distinctUnits: number; windowMinutes: number },
  now: Date,
): VelocityResult | null {
  const windowStart = new Date(
    now.getTime() - thresholds.windowMinutes * 60_000,
  );
  const inWindow = scans.filter((s) => s.unitId && s.createdAt >= windowStart);

  const unitIds = [...new Set(inWindow.map((s) => s.unitId!))];
  if (unitIds.length < thresholds.distinctUnits) return null;

  const batchIds = new Set(
    inWindow.map((s) => s.batchId).filter((b): b is string => !!b),
  );
  const batchId = batchIds.size === 1 ? [...batchIds][0] : null;

  return { distinctUnitCount: unitIds.length, unitIds, batchId };
}

/**
 * True when a tier-2 code is scanned while its batch has not yet shipped.
 */
export function evaluateDeadCode(
  tier: 'tier1' | 'tier2',
  batchStatus: string,
): boolean {
  if (tier !== 'tier2') return false;
  return !['shipped', 'closed'].includes(batchStatus);
}

/**
 * True when a tier-2 code is scanned before the batch's expected ship date
 * (minus a grace period). `expectedShipDate` unset means the rule can't
 * evaluate — never fires (documented stub until E05 writes the field).
 */
export function evaluatePreReveal(
  tier: 'tier1' | 'tier2',
  scanAt: Date,
  expectedShipDate: Date | null,
  thresholds: { graceDays: number },
): boolean {
  if (tier !== 'tier2' || !expectedShipDate) return false;
  const cutoff = new Date(
    expectedShipDate.getTime() - thresholds.graceDays * 86_400_000,
  );
  return scanAt < cutoff;
}

export interface DuplicateFirstResult {
  distanceKm: number;
  current: { scanEventId: string; city: string; at: Date };
  previous: { scanEventId: string; city: string; at: Date };
}

/**
 * True when the same unit's tier-2 code is scanned twice within
 * `windowMinutes`, from cities at least `minDistanceKm` apart. Cities not in
 * the bundled centroid table can't be distance-checked and never trigger
 * this rule (documented — no coordinates are ever persisted to compensate).
 */
export function evaluateDuplicateFirst(
  current: { scanEventId: string; geoCity: string | null; createdAt: Date },
  previous: {
    scanEventId: string;
    geoCity: string | null;
    createdAt: Date;
  } | null,
  thresholds: { windowMinutes: number; minDistanceKm: number },
): DuplicateFirstResult | null {
  if (!previous || !current.geoCity || !previous.geoCity) return null;

  const minutesApart =
    Math.abs(current.createdAt.getTime() - previous.createdAt.getTime()) /
    60_000;
  if (minutesApart > thresholds.windowMinutes) return null;

  const distanceKm = cityDistanceKm(current.geoCity, previous.geoCity);
  if (distanceKm === null || distanceKm < thresholds.minDistanceKm) return null;

  return {
    distanceKm,
    current: {
      scanEventId: current.scanEventId,
      city: current.geoCity,
      at: current.createdAt,
    },
    previous: {
      scanEventId: previous.scanEventId,
      city: previous.geoCity,
      at: previous.createdAt,
    },
  };
}
