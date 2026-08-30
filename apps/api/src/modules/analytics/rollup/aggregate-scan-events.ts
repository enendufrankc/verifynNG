export interface ScanEventLike {
  tenantId: string;
  createdAt: Date;
  productId: string | null;
  batchId: string | null;
  tier: 'tier1' | 'tier2';
  verdict: string;
  ipHash: string | null;
  geoCountry: string | null;
  geoCity: string | null;
}

export interface TopCountry {
  country: string;
  city?: string;
  count: number;
}

export interface ScanRollupRow {
  tenantId: string;
  date: Date; // UTC day, 00:00:00
  productId: string | null;
  batchId: string | null;
  tier: number;
  verdict: string;
  count: number;
  distinctIpCount: number;
  topCountries: TopCountry[];
}

const TOP_COUNTRIES_LIMIT = 10;

/**
 * Pure aggregation: a flat list of ScanEvent-shaped rows for ONE tenant+day
 * in → ScanRollupDaily rows out, one per (productId, batchId, tier, verdict)
 * combination. Callers are responsible for scoping the input to a single day
 * (or a caller may pass events spanning multiple days — they group correctly
 * either way since `date` is part of the bucket key).
 */
export function aggregateScanEvents(events: ScanEventLike[]): ScanRollupRow[] {
  interface Bucket {
    tenantId: string;
    date: Date;
    productId: string | null;
    batchId: string | null;
    tier: number;
    verdict: string;
    count: number;
    ips: Set<string>;
    countries: Map<string, TopCountry>;
  }

  const buckets = new Map<string, Bucket>();

  for (const e of events) {
    const date = startOfUtcDay(e.createdAt);
    const tier = e.tier === 'tier1' ? 1 : 2;
    const key = [
      e.tenantId,
      date.toISOString(),
      e.productId ?? '',
      e.batchId ?? '',
      tier,
      e.verdict,
    ].join('|');

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        tenantId: e.tenantId,
        date,
        productId: e.productId,
        batchId: e.batchId,
        tier,
        verdict: e.verdict,
        count: 0,
        ips: new Set(),
        countries: new Map(),
      };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (e.ipHash) bucket.ips.add(e.ipHash);
    if (e.geoCountry) {
      const countryKey = `${e.geoCountry}|${e.geoCity ?? ''}`;
      const existing = bucket.countries.get(countryKey);
      if (existing) existing.count += 1;
      else
        bucket.countries.set(countryKey, {
          country: e.geoCountry,
          city: e.geoCity ?? undefined,
          count: 1,
        });
    }
  }

  return [...buckets.values()].map((bucket) => ({
    tenantId: bucket.tenantId,
    date: bucket.date,
    productId: bucket.productId,
    batchId: bucket.batchId,
    tier: bucket.tier,
    verdict: bucket.verdict,
    count: bucket.count,
    distinctIpCount: bucket.ips.size,
    topCountries: [...bucket.countries.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_COUNTRIES_LIMIT),
  }));
}

export function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
