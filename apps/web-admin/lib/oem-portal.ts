import { apiClient } from './api-client';
import { useAuthStore } from './auth-store';
import type {
  DeliveryStatus,
  ManifestDownloadRow,
  PrintReceiptRow,
} from './deliveries';

export interface OemDelivery {
  id: string;
  batchId: string;
  expiresAt: string;
  maxDownloads: number;
  downloadCount: number;
  status: DeliveryStatus;
  deliveredAt: string;
  batch: {
    id: string;
    count: number;
    product: { id: string; sku: string; name: string };
  };
}

export interface OemDeliveryDetail extends OemDelivery {
  downloads: ManifestDownloadRow[];
  receipts: PrintReceiptRow[];
}

export interface SubmitReceiptInput {
  receiptHash: string;
  codeCount: number;
  watermarks: string[];
}

export interface ShipInput {
  carrier?: string;
  trackingRef?: string;
  shippedAt?: string;
  expectedArrivalAt?: string;
}

export function listOemDeliveries() {
  return apiClient.get<OemDelivery[]>('/v1/oem/deliveries');
}

export function getOemDelivery(id: string) {
  return apiClient.get<OemDeliveryDetail>(`/v1/oem/deliveries/${id}`);
}

export function submitReceipt(id: string, input: SubmitReceiptInput) {
  return apiClient.post<PrintReceiptRow>(
    `/v1/oem/deliveries/${id}/receipt`,
    input,
  );
}

export function shipDelivery(id: string, input: ShipInput) {
  return apiClient.post(`/v1/oem/deliveries/${id}/ship`, input);
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * The manifest/artwork routes are token-gated GETs meant for direct browser
 * navigation (download prompts, redirects) — they still need the caller's JWT
 * (OemScopeGuard), which a plain `<a href>` can't attach, so this builds a
 * fetch-and-save flow the same way lib/batches.ts's downloadArtefact does.
 */
export async function downloadManifest(
  id: string,
  token: string,
  fileName: string,
) {
  const accessToken = useAuthStore.getState().accessToken;
  const url = new URL(`/v1/oem/deliveries/${id}/manifest`, API_BASE);
  url.searchParams.set('token', token);
  const res = await fetch(url, {
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function artworkUrl(id: string, token: string): string {
  const url = new URL(`/v1/oem/deliveries/${id}/artwork`, API_BASE);
  url.searchParams.set('token', token);
  return url.toString();
}
