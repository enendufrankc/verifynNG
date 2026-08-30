import { apiClient } from './api-client';
import { useAuthStore } from './auth-store';

export type BatchStatus =
  | 'minting'
  | 'minted'
  | 'delivered'
  | 'printed'
  | 'shipped'
  | 'closed'
  | 'failed';

export interface Batch {
  id: string;
  tenantId: string;
  productId: string;
  oemId: string;
  count: number;
  status: BatchStatus;
  idempotencyKey: string;
  note: string | null;
  watermark: string;
  kid: string;
  mintedCount: number;
  jobId: string | null;
  failedReason: string | null;
  exportsReadyAt: string | null;
  mintedAt: string | null;
  manifestObjectKey: string | null;
  createdAt: string;
}

export interface BatchDetail extends Batch {
  product: { id: string; sku: string; name: string; gtin: string | null };
  oem: { id: string; name: string };
  artefacts: Array<{ kind: string; objectKey: string }>;
  progress: { minted: number; total: number; percent: number };
}

export interface Unit {
  id: string;
  serial: number;
  tier1Code: string;
  state: string;
  createdAt: string;
}

export interface JobStatus {
  state: string;
  progress: number | Record<string, unknown>;
  failedReason?: string;
}

export type ArtefactKind = 'qr-zip' | 'tier1-csv' | 'sheet-pdf' | 'all-zip';

export function listBatches(tenantPath: (path: string) => string) {
  return apiClient.get<Batch[]>(tenantPath('/batches'));
}

export function getBatch(
  tenantPath: (path: string) => string,
  batchId: string,
) {
  return apiClient.get<BatchDetail>(tenantPath(`/batches/${batchId}`));
}

export function getBatchUnits(
  tenantPath: (path: string) => string,
  batchId: string,
  cursor?: string,
) {
  return apiClient.get<Unit[]>(tenantPath(`/batches/${batchId}/units`), {
    query: cursor ? { cursor, limit: '100' } : { limit: '100' },
  });
}

export function mintBatch(
  tenantPath: (path: string) => string,
  input: {
    productId: string;
    oemId: string;
    count: number;
    idempotencyKey: string;
    note?: string;
  },
) {
  return apiClient.post<BatchDetail | { batch: BatchDetail; jobId: string }>(
    tenantPath('/batches'),
    input,
  );
}

export function getJob(tenantPath: (path: string) => string, jobId: string) {
  return apiClient.get<JobStatus>(tenantPath(`/jobs/${jobId}`));
}

/**
 * The download route is a 302 to a presigned MinIO URL and requires the
 * caller's JWT, so a plain <a href> won't carry the Authorization header —
 * fetch it, follow the redirect, and save the resulting blob ourselves.
 */
export async function downloadArtefact(
  tenantPath: (path: string) => string,
  batchId: string,
  artefact: ArtefactKind,
  fileName: string,
): Promise<void> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(
    new URL(tenantPath(`/batches/${batchId}/downloads/${artefact}`), API_BASE),
    { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
