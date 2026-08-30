import { apiClient } from './api-client';

export type ReportStatus = 'new' | 'triaged' | 'investigating' | 'closed';
export type ReportOutcome = 'confirmed_counterfeit' | 'legit' | 'insufficient';

export interface ReportPhoto {
  id: string;
  status: string;
  objectKey: string | null;
}

export interface Report {
  id: string;
  reference: string;
  status: ReportStatus;
  outcome: ReportOutcome | null;
  verdictAtReport: string;
  productId: string | null;
  batchId: string | null;
  unitId: string | null;
  purchaseChannel: string;
  sellerName: string | null;
  assignedToId: string | null;
  createdAt: string;
  photos?: ReportPhoto[];
}

export interface ReportSummary {
  new: number;
  triaged: number;
  investigating: number;
  closed: number;
  byOutcome: Record<string, number>;
}

export interface ReportNote {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface ReportStatusChangeEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  outcome: string | null;
  note: string | null;
  createdAt: string;
}

// Shape returned by E06's ScanEventsService.forUnit().
export interface ReportScanHistoryEntry {
  id: string;
  tier: string;
  verdict: string;
  source: string;
  createdAt: string;
}

export interface ReportDetail extends Report {
  contactEmail: string | null;
  contactPhone: string | null;
  photos: ReportPhoto[];
  notes: ReportNote[];
  statusChanges: ReportStatusChangeEntry[];
  scanHistory: ReportScanHistoryEntry[];
  anomalies: unknown[];
}

export function listReports(params?: {
  status?: string;
  assignedToId?: string;
}) {
  const query: Record<string, string> = {};
  if (params?.status) query.status = params.status;
  if (params?.assignedToId) query.assignedToId = params.assignedToId;
  return apiClient.get<Report[]>('/v1/reports', {
    query: Object.keys(query).length ? query : undefined,
  });
}

export function getReportsSummary() {
  return apiClient.get<ReportSummary>('/v1/reports/summary');
}

export function getReport(id: string) {
  return apiClient.get<ReportDetail>(`/v1/reports/${id}`);
}

export function assignReport(id: string, memberId: string) {
  return apiClient.post<{ ok: true }>(`/v1/reports/${id}/assign`, {
    memberId,
  });
}

export function addReportNote(id: string, body: string) {
  return apiClient.post<{ ok: true }>(`/v1/reports/${id}/notes`, { body });
}

export function changeReportStatus(
  id: string,
  input: {
    status: ReportStatus;
    outcome?: ReportOutcome;
    note?: string;
    notifyConsumer?: boolean;
  },
) {
  return apiClient.post<{ ok: true }>(`/v1/reports/${id}/status`, input);
}
