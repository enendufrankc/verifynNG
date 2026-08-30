import { apiClient } from './api-client';

export type UnitState = 'active' | 'flagged' | 'decommissioned';

export interface Unit {
  id: string;
  tenantId: string;
  batchId: string;
  productId: string;
  tier1Code: string;
  serial: number;
  state: UnitState;
  createdAt: string;
}

export interface UnitTransition {
  id: string;
  unitId: string;
  fromState: string;
  toState: string;
  reason: string;
  actorType: string;
  actorId: string | null;
  anomalyId: string | null;
  recallJobId: string | null;
  createdAt: string;
}

export interface ScanEvent {
  id: string;
  tier: 'tier1' | 'tier2';
  verdict: string;
  geoCity: string | null;
  geoCountry: string | null;
  createdAt: string;
}

export interface UnitDetail {
  unit: Unit;
  transitions: UnitTransition[];
  scanEvents: ScanEvent[];
  anomalies: Array<{
    id: string;
    rule: string;
    score: number;
    status: string;
    createdAt: string;
  }>;
}

export function getUnit(id: string) {
  return apiClient.get<UnitDetail>(`/v1/units/${id}`);
}

export function flagUnit(id: string, reason: string) {
  return apiClient.post<Unit>(`/v1/units/${id}/flag`, { reason });
}

export function decommissionUnit(id: string, reason: string) {
  return apiClient.post<Unit>(`/v1/units/${id}/decommission`, { reason });
}

export function restoreUnit(id: string, reason: string) {
  return apiClient.post<Unit>(`/v1/units/${id}/restore`, { reason });
}

export function getBatchUnits(
  batchId: string,
  state?: UnitState,
  cursor?: string,
) {
  const query: Record<string, string> = {};
  if (state) query.state = state;
  if (cursor) query.cursor = cursor;
  return apiClient.get<{ items: Unit[]; cursor?: string }>(
    `/v1/batches/${batchId}/units`,
    { query },
  );
}

export function recallBatch(batchId: string, reason: string) {
  return apiClient.post<{ jobId: string }>(`/v1/batches/${batchId}/recall`, {
    reason,
  });
}

export function getRecallProgress(batchId: string, jobId: string) {
  return apiClient.get<{ jobId: string; state: string; progress: number }>(
    `/v1/batches/${batchId}/recall/${jobId}`,
  );
}
