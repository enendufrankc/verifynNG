import type { Block, Seo, ThemeOverride } from '@verifynng/page-schema';
import { apiClient, ApiError } from './api-client';
import { useAuthStore } from './auth-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: Array<{ field: string; message: string }>;
}

/**
 * apiClient (E11) has no If-Match header support or multipart body support
 * — both narrow, product-pages-only needs — so this stays local rather than
 * growing the shared client for two callers.
 */
async function rawRequest<T>(
  method: string,
  path: string,
  opts: { body?: BodyInit; headers?: Record<string, string> },
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(new URL(path, API_BASE).toString(), {
    method,
    headers,
    body: opts.body,
  });
  if (!res.ok) {
    const err: ApiErrorBody = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.message ?? res.statusText,
      err.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ProductPageStatus = 'draft' | 'published' | 'unpublished';

export interface ProductPage {
  id: string;
  tenantId: string;
  productId: string;
  slug: string;
  status: ProductPageStatus;
  schemaVersion: number;
  draftTheme: ThemeOverride;
  draftBlocks: Block[];
  draftSeo: Seo;
  draftUpdatedAt: string;
  publishedVersionId: string | null;
  publishedAt: string | null;
  createdById: string;
  createdAt: string;
}

export interface ProductPageVersion {
  id: string;
  tenantId: string;
  productPageId: string;
  version: number;
  schemaVersion: number;
  theme: ThemeOverride;
  blocks: Block[];
  seo: Seo;
  changeNote: string | null;
  publishedById: string;
  publishedAt: string;
}

export interface MediaRefResponse {
  assetId: string;
  alt: string;
  width: number;
  height: number;
  blurDataUrl?: string;
  variants: { webp: string[]; avif?: string[] };
}

export function listProductPages() {
  return apiClient.get<ProductPage[]>('/v1/product-pages');
}

export function getProductPage(id: string) {
  return apiClient.get<ProductPage>(`/v1/product-pages/${id}`);
}

export function createProductPage(input: { productId: string; slug: string }) {
  return apiClient.post<ProductPage>('/v1/product-pages', input);
}

export async function saveDraft(
  id: string,
  draft: { theme: ThemeOverride; blocks: Block[]; seo: Seo },
  ifMatch?: string,
): Promise<ProductPage> {
  return rawRequest<ProductPage>('PUT', `/v1/product-pages/${id}/draft`, {
    body: JSON.stringify(draft),
    headers: {
      'Content-Type': 'application/json',
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
  });
}

export function publishProductPage(id: string, changeNote?: string) {
  return apiClient.post<ProductPageVersion>(`/v1/product-pages/${id}/publish`, {
    changeNote,
  });
}

export function rollbackProductPage(id: string, versionId: string) {
  return apiClient.post<ProductPageVersion>(
    `/v1/product-pages/${id}/rollback`,
    {
      versionId,
    },
  );
}

export function listProductPageVersions(id: string) {
  return apiClient.get<ProductPageVersion[]>(
    `/v1/product-pages/${id}/versions`,
  );
}

export function unpublishProductPage(id: string) {
  return apiClient.delete<{ ok: true }>(`/v1/product-pages/${id}`);
}

export function getPreviewToken(id: string) {
  return apiClient.get<{ token: string; expiresInSec: number }>(
    `/v1/product-pages/${id}/preview-token`,
  );
}

export async function uploadPageMedia(
  id: string,
  file: File,
  alt: string,
): Promise<MediaRefResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('alt', alt);
  // No Content-Type header — the browser sets multipart/form-data with the
  // correct boundary itself; setting it manually breaks the boundary.
  return rawRequest<MediaRefResponse>('POST', `/v1/product-pages/${id}/media`, {
    body: form,
  });
}
