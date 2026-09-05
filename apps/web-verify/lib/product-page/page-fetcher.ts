import 'server-only';
import { z } from 'zod';
import { loadEnv } from '@verifynng/config';
import {
  blockSchema,
  seoSchema,
  themeOverrideSchema,
} from '@verifynng/page-schema';

function apiInternalUrl(): string {
  return process.env.API_INTERNAL_URL || loadEnv().NEXT_PUBLIC_API_URL;
}

const metaSchema = z.object({
  productId: z.string(),
  tenantSlug: z.string(),
  productSlug: z.string(),
  status: z.enum(['draft', 'published', 'unpublished']),
  version: z.number().optional(),
  publishedAt: z.string().nullable().optional(),
  draftUpdatedAt: z.string().optional(),
});

const publicPageResponseSchema = z.object({
  schemaVersion: z.number(),
  theme: themeOverrideSchema,
  blocks: z.array(blockSchema),
  seo: seoSchema,
  meta: metaSchema,
});

export type PublicPageResponse = z.infer<typeof publicPageResponseSchema>;

export type PageFetchResult =
  | { ok: true; data: PublicPageResponse }
  | { ok: false; status: number };

async function fetchPage(
  path: string,
  init: RequestInit,
): Promise<PageFetchResult> {
  const url = new URL(path, apiInternalUrl());
  let res: Response;
  try {
    res = await fetch(url.toString(), init);
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: 502 };
  }
  const parsed = publicPageResponseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, status: 502 };
  return { ok: true, data: parsed.data };
}

/** `GET /v1/public/pages/:tenantSlug/:productSlug` — published version, safe to cache. */
export async function getPublishedPage(
  tenantSlug: string,
  productSlug: string,
): Promise<PageFetchResult> {
  return fetchPage(
    `/v1/public/pages/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productSlug)}`,
    { next: { revalidate: 300, tags: [`page:${tenantSlug}:${productSlug}`] } },
  );
}

/** `GET /v1/public/pages/:tenantSlug/:productSlug?preview=<token>` — draft, never cached. */
export async function getDraftPreviewPage(
  tenantSlug: string,
  productSlug: string,
  token: string,
): Promise<PageFetchResult> {
  return fetchPage(
    `/v1/public/pages/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productSlug)}?preview=${encodeURIComponent(token)}`,
    { cache: 'no-store' },
  );
}

/** `GET /v1/public/pages/tier1/:tenantSlug/:productId` — used by the tier-1 slot renderer (T7). */
export async function getTier1Page(
  tenantSlug: string,
  productId: string,
): Promise<PageFetchResult> {
  return fetchPage(
    `/v1/public/pages/tier1/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(productId)}`,
    { next: { revalidate: 300, tags: [`tier1:${tenantSlug}:${productId}`] } },
  );
}

const sitemapEntrySchema = z.object({
  slug: z.string(),
  lastmod: z.string().nullable(),
});

/** `GET /v1/public/pages/:tenantSlug/sitemap` — slugs + lastmod for T8's sitemap route. */
export async function getSitemapEntries(
  tenantSlug: string,
): Promise<{ slug: string; lastmod: string | null }[]> {
  const url = new URL(
    `/v1/public/pages/${encodeURIComponent(tenantSlug)}/sitemap`,
    apiInternalUrl(),
  );
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const parsed = z.array(sitemapEntrySchema).safeParse(json);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
