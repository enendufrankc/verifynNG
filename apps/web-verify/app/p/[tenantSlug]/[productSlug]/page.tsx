import type { Metadata } from 'next';
import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import { loadEnv } from '@verifynng/config';
import { getTenantPublicProfile } from '@/lib/api';
import { DEFAULT_LOCALE, LocaleProvider } from '@/lib/i18n';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';
import { PageBeacon } from '@/components/analytics/PageBeacon';
import { ProductPageView } from '@/components/product-page/ProductPageView';
import { pageThemeStyle } from '@/lib/product-page/theme';
import { getPublishedPage } from '@/lib/product-page/page-fetcher';
import { buildProductJsonLd } from '@/lib/product-page/json-ld';

// Not `revalidate`/`generateStaticParams` — E09's root layout.tsx calls
// headers() (already flagged as an unresolved FYI to E17 in
// CROSS-EPIC-REQUESTS.md), which forces every nested route dynamic. A child
// page that still declares generateStaticParams/revalidate under that root
// hard-errors with DYNAMIC_SERVER_USAGE instead of silently downgrading
// (confirmed against a live docker compose up build — bisected down to a
// bare page with zero dynamic calls of its own). Every route in this app
// is already `ƒ Dynamic` for the same reason (see AGENTS.md/E09 sections of
// CROSS-EPIC-REQUESTS.md), so this matches existing behaviour rather than
// diverging from it. Freshness instead comes from the API's
// `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` (T3)
// plus T5's on-demand revalidatePath/revalidateTag call on publish/rollback/
// unpublish. True Next.js ISR (and AC1's `x-nextjs-cache: HIT`) needs a
// change request to E09: give `/p/**` its own root layout (Next.js
// "multiple root layouts") so it isn't nested under one that calls
// headers().
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ tenantSlug: string; productSlug: string }>;
}

// generateMetadata and the page component both need the same published page
// and tenant profile — React.cache dedupes the two fetches into one per
// request (same pattern as E09's /v/[code]/page.tsx `loadVerify`).
const loadPage = cache((tenantSlug: string, productSlug: string) =>
  getPublishedPage(tenantSlug, productSlug),
);
const loadProfile = cache((tenantSlug: string) =>
  getTenantPublicProfile(tenantSlug),
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tenantSlug, productSlug } = await params;
  const result = await loadPage(tenantSlug, productSlug);
  if (!result.ok) return {};

  const { seo, meta } = result.data;
  const profile = await loadProfile(tenantSlug);
  const env = loadEnv();
  const canonical = `${env.PAGES_PUBLIC_BASE_URL}/p/${meta.tenantSlug}/${meta.productSlug}`;
  const title = seo.title ?? `${profile.name} — ${meta.productSlug}`;

  const heroImage = result.data.blocks.find((b) => b.type === 'hero');
  const ogImageUrl =
    heroImage && heroImage.type === 'hero'
      ? (heroImage.image.variants.webp[
          heroImage.image.variants.webp.length - 1
        ] ?? heroImage.image.variants.webp[0])
      : undefined;

  return {
    title,
    description: seo.description,
    alternates: { canonical },
    robots: seo.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description: seo.description,
      url: canonical,
      ...(ogImageUrl
        ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: seo.description,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { tenantSlug, productSlug } = await params;
  const result = await loadPage(tenantSlug, productSlug);
  // Next.js App Router pages can only signal 404 (via notFound()) or a
  // redirect — there is no supported way to return 410 from a page.tsx
  // (confirmed against vercel/next.js discussion #86345). The API's public
  // route already returns real 410s for unpublished/offboarded (E13
  // isolation covers that at the API layer); this collapses both "never
  // existed" and "gone" to 404 here. Getting the literal 410 onto the
  // browser response requires a middleware-level change request to E09.
  if (!result.ok) notFound();

  const { blocks, theme, seo } = result.data;
  const profile = await loadProfile(tenantSlug);
  const locale = DEFAULT_LOCALE;

  const jsonLd = buildProductJsonLd({
    tenantName: profile.name,
    productSlug,
    seo,
    blocks,
    canonicalUrl: `${loadEnv().PAGES_PUBLIC_BASE_URL}/p/${tenantSlug}/${productSlug}`,
  });

  return (
    <TenantThemeProvider profile={profile}>
      <LocaleProvider locale={locale}>
        <div style={pageThemeStyle(profile, theme)} className="contents">
          {/* PageBeacon uses useSearchParams() with no Suspense boundary of
              its own — wrap it so a future re-enabling of ISR here doesn't
              regress on that too. */}
          <Suspense fallback={null}>
            <PageBeacon tenantSlug={tenantSlug} locale={locale} />
          </Suspense>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <ProductPageView profile={profile} blocks={blocks} />
        </div>
      </LocaleProvider>
    </TenantThemeProvider>
  );
}
