import { apiClient } from './api-client';

export type DeliveryStatus =
  | 'delivered'
  | 'downloaded'
  | 'receipted'
  | 'revoked'
  | 'expired';

export interface ManifestDownloadRow {
  id: string;
  oemUserId: string | null;
  ip: string;
  userAgent: string | null;
  createdAt: string;
}

export interface PrintReceiptRow {
  id: string;
  matched: boolean;
  mismatchReason: 'hash' | 'count' | 'watermark' | null;
  codeCount: number;
  expectedCount: number;
  watermarks: string[];
  expectedWatermark: string;
  createdAt: string;
}

export interface Delivery {
  id: string;
  tenantId: string;
  batchId: string;
  oemId: string;
  tokenVersion: number;
  expiresAt: string;
  maxDownloads: number;
  downloadCount: number;
  expectedShipDate: string | null;
  status: DeliveryStatus;
  deliveredAt: string;
  revokedAt: string | null;
  oem: { id: string; name: string };
  downloads: ManifestDownloadRow[];
  receipts: PrintReceiptRow[];
  batch?: {
    id: string;
    status: string;
    product: { sku: string; name: string };
  };
}

export interface DeliverBatchInput {
  oemId: string;
  expiresInHours?: number;
  maxDownloads?: number;
  expectedShipDate?: string;
}

export function listAllDeliveries(tenantPath: (path: string) => string) {
  return apiClient.get<Delivery[]>(tenantPath('/deliveries'));
}

export function getDelivery(
  tenantPath: (path: string) => string,
  deliveryId: string,
) {
  return apiClient.get<Delivery>(tenantPath(`/deliveries/${deliveryId}`));
}

export function listDeliveriesForBatch(
  tenantPath: (path: string) => string,
  batchId: string,
) {
  return apiClient.get<Delivery[]>(
    tenantPath(`/batches/${batchId}/deliveries`),
  );
}

export function deliverBatch(
  tenantPath: (path: string) => string,
  batchId: string,
  input: DeliverBatchInput,
) {
  return apiClient.post<Delivery>(
    tenantPath(`/batches/${batchId}/deliveries`),
    input,
  );
}

export function receiptsForBatch(
  tenantPath: (path: string) => string,
  batchId: string,
) {
  return apiClient.get<PrintReceiptRow[]>(
    tenantPath(`/batches/${batchId}/receipts`),
  );
}

export function revokeDelivery(
  tenantPath: (path: string) => string,
  deliveryId: string,
) {
  return apiClient.post<Delivery>(
    tenantPath(`/deliveries/${deliveryId}/revoke`),
  );
}

export function resendDelivery(
  tenantPath: (path: string) => string,
  deliveryId: string,
) {
  return apiClient.post<Delivery>(
    tenantPath(`/deliveries/${deliveryId}/resend`),
  );
}

export function closeBatch(
  tenantPath: (path: string) => string,
  batchId: string,
) {
  return apiClient.post(tenantPath(`/batches/${batchId}/close`));
}
