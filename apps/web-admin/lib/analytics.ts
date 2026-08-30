import { apiClient } from './api-client';
import { useAuthStore } from './auth-store';

export type RangeKey = '7d' | '30d' | '90d';

export interface OverviewMetrics {
  scans: number;
  tier1Scans: number;
  tier2Verifies: number;
  suspiciousPct: number;
  flaggedUnits: number;
  distinctCountries: number;
}

export interface OverviewResponse extends OverviewMetrics {
  deltas: OverviewMetrics;
}

export interface BatchRow {
  batchId: string;
  productId: string | null;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
  flagged: number;
  topCountry: string | null;
}

export interface ProductRow {
  productId: string;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
  flagged: number;
  topCountry: string | null;
}

export interface GeoRow {
  country: string;
  city?: string;
  scans: number;
  tier2Verifies: number;
  suspicious: number;
}

export interface VerdictSeriesPoint {
  date: string;
  verdict: string;
  count: number;
}

export function getOverview(range: RangeKey) {
  return apiClient.get<OverviewResponse>('/v1/analytics/overview', {
    query: { range },
  });
}

export function getBatches(range: RangeKey, sort?: string) {
  return apiClient.get<BatchRow[]>('/v1/analytics/batches', {
    query: { range, ...(sort ? { sort } : {}) },
  });
}

export function getProducts(range: RangeKey, sort?: string) {
  return apiClient.get<ProductRow[]>('/v1/analytics/products', {
    query: { range, ...(sort ? { sort } : {}) },
  });
}

export function getGeo(
  range: RangeKey,
  groupBy: 'country' | 'city' = 'country',
  entity?: { batchId?: string; productId?: string },
) {
  return apiClient.get<GeoRow[]>('/v1/analytics/geo', {
    query: {
      range,
      groupBy,
      ...(entity?.batchId ? { batchId: entity.batchId } : {}),
      ...(entity?.productId ? { productId: entity.productId } : {}),
    },
  });
}

export function getVerdicts(
  range: RangeKey,
  entity?: { batchId?: string; productId?: string },
) {
  return apiClient.get<VerdictSeriesPoint[]>('/v1/analytics/verdicts', {
    query: {
      range,
      bucket: 'day',
      ...(entity?.batchId ? { batchId: entity.batchId } : {}),
      ...(entity?.productId ? { productId: entity.productId } : {}),
    },
  });
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * CSV export isn't JSON, so it bypasses apiClient's request() (which always
 * calls res.json()). Triggers a browser download via an object URL.
 */
export async function downloadExport(
  range: RangeKey,
  dimension: 'batch' | 'product' | 'geo' | 'verdict',
): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const url = new URL('/v1/analytics/export.csv', API_BASE);
  url.searchParams.set('range', range);
  url.searchParams.set('dimension', dimension);

  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `analytics-${dimension}-${range}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
