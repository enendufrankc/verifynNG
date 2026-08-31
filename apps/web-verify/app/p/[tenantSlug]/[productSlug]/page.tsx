import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { loadEnv } from '@verifynng/config';
import { getTenantPublicProfile } from '@/lib/api';
import { resolveLocale, LocaleProvider } from '@/lib/i18n';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';
import { PageBeacon } from '@/components/analytics/PageBeacon';
import { ProductPageView } from '@/components/product-page/ProductPageView';
import { pageThemeStyle } from '@/lib/product-page/theme';
import {
  getPublishedPage,
  getSitemapEntries,
} from '@/lib/product-page/page-fetcher';

export const revalidate = 300; // safety net — publish/rollback/unpublish revalidate on-demand (T5)
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ tenantSlug: string; productSlug: string }>;
}

export async function generateStaticParams() {
  const env = loadEnv();
  const tenantSlug = env.NEXT_PUBLIC_DEFAULT_TENANT;
  const entries = await getSitemapEntries(tenantSlug);
  return entries.map((entry) => ({ tenantSlug, productSlug: entry.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tenantSlug, productSlug } = await params;
  const result = await getPublishedPage(tenantSlug, productSlug);
  if (!result.ok) return {};

  const { seo, meta } = result.data;
  const profile = await getTenantPublicProfile(tenantSlug);
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
  const result = await getPublishedPage(tenantSlug, productSlug);
  // Next.js App Router pages can only signal 404 (via notFound()) or a
  // redirect — there is no supported way to return 410 from a page.tsx
  // (confirmed against vercel/next.js discussion #86345). The API's public
  // route already returns real 410s for unpublished/offboarded (E13
  // isolation covers that at the API layer); this collapses both "never
  // existed" and "gone" to 404 here. Getting the literal 410 onto the
  // browser response requires a middleware-level change request to E09.
  if (!result.ok) notFound();

  const { blocks, theme, seo } = result.data;
  const profile = await getTenantPublicProfile(tenantSlug);
  const h = await headers();
  const locale = resolveLocale(undefined, h.get('accept-language'));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: seo.title ?? productSlug,
    brand: { '@type': 'Brand', name: profile.name },
    description: seo.description,
    url: `${loadEnv().PAGES_PUBLIC_BASE_URL}/p/${tenantSlug}/${productSlug}`,
    image: blocks
      .filter((b) => b.type === 'hero')
      .flatMap((b) => (b.type === 'hero' ? b.image.variants.webp : [])),
  };

  return (
    <TenantThemeProvider profile={profile}>
      <LocaleProvider locale={locale}>
        <div style={pageThemeStyle(profile, theme)} className="contents">
          <PageBeacon tenantSlug={tenantSlug} locale={locale} />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <ProductPageView profile={profile} blocks={blocks} locale={locale} />
        </div>
      </LocaleProvider>
    </TenantThemeProvider>
  );
}
