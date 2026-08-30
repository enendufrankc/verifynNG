import { apiClient } from './api-client';

export type RuleId =
  | 'geo_dispersion'
  | 'velocity'
  | 'dead_code'
  | 'pre_reveal'
  | 'duplicate_first';

export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface EvidenceScan {
  scanEventId: string;
  at: string;
  city: string | null;
  country: string | null;
}

export interface Anomaly {
  id: string;
  tenantId: string;
  rule: RuleId;
  unitId: string | null;
  batchId: string | null;
  score: number;
  status: AnomalyStatus;
  evidence: {
    scans: EvidenceScan[];
    thresholds: Record<string, number>;
    computed: Record<string, unknown>;
    source: 'event' | 'sweep';
  };
  assignedToId: string | null;
  note: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AnomalySummary {
  open: number;
  acknowledged: number;
  byRule: Record<string, number>;
}

export interface RuleConfig {
  enabled: boolean;
  thresholds: Record<string, number>;
  score: number;
  autoFlagAt: number;
}

export function listAnomalies(filters: {
  status?: AnomalyStatus;
  rule?: string;
  batchId?: string;
  unitId?: string;
  minScore?: number;
  cursor?: string;
}) {
  const query: Record<string, string> = {};
  if (filters.status) query.status = filters.status;
  if (filters.rule) query.rule = filters.rule;
  if (filters.batchId) query.batchId = filters.batchId;
  if (filters.unitId) query.unitId = filters.unitId;
  if (filters.minScore !== undefined) query.minScore = String(filters.minScore);
  if (filters.cursor) query.cursor = filters.cursor;
  return apiClient.get<{ items: Anomaly[]; cursor?: string }>('/v1/anomalies', {
    query,
  });
}

export function getAnomalySummary() {
  return apiClient.get<AnomalySummary>('/v1/anomalies/summary');
}

export interface LinkedScan {
  id: string;
  createdAt: string;
  geoCity: string | null;
  geoCountry: string | null;
  verdict: string;
}

export interface AnomalyDetail {
  anomaly: Anomaly;
  unit: { id: string; tier1Code: string; state: string } | null;
  batch: { id: string; watermark: string; status: string } | null;
  linkedScans: LinkedScan[];
}

export function getAnomaly(id: string) {
  return apiClient.get<AnomalyDetail>(`/v1/anomalies/${id}`);
}

export function acknowledgeAnomaly(id: string, note?: string) {
  return apiClient.post<Anomaly>(`/v1/anomalies/${id}/acknowledge`, { note });
}

export function resolveAnomaly(id: string, note?: string) {
  return apiClient.post<Anomaly>(`/v1/anomalies/${id}/resolve`, { note });
}

export function dismissAnomaly(id: string, note?: string) {
  return apiClient.post<Anomaly>(`/v1/anomalies/${id}/dismiss`, { note });
}

export function getAnomalyRules() {
  return apiClient.get<Record<RuleId, RuleConfig>>('/v1/anomaly-rules');
}

export function updateAnomalyRules(
  patch: Partial<
    Record<RuleId, { enabled?: boolean; thresholds?: Record<string, number> }>
  >,
) {
  return apiClient.put<Record<RuleId, RuleConfig>>('/v1/anomaly-rules', patch);
}
