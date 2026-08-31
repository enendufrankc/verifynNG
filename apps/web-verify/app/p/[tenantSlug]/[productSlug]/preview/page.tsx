import { notFound } from 'next/navigation';
import { getTenantPublicProfile } from '@/lib/api';
import { resolveLocale, LocaleProvider } from '@/lib/i18n';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';
import { ProductPageView } from '@/components/product-page/ProductPageView';
import { pageThemeStyle } from '@/lib/product-page/theme';
import { getDraftPreviewPage } from '@/lib/product-page/page-fetcher';

// Draft preview is per-request and never cached — split out of the
// published page.tsx (ISR) because reading a per-request token via
// searchParams there throws DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ tenantSlug: string; productSlug: string }>;
  searchParams: Promise<{ token?: string; lang?: string }>;
}

export default async function ProductPagePreview({
  params,
  searchParams,
}: PageProps) {
  const { tenantSlug, productSlug } = await params;
  const { token, lang } = await searchParams;
  if (!token) notFound();

  const result = await getDraftPreviewPage(tenantSlug, productSlug, token);
  if (!result.ok) notFound();

  const { blocks, theme } = result.data;
  const profile = await getTenantPublicProfile(tenantSlug);
  const locale = resolveLocale(lang, null);

  return (
    <TenantThemeProvider profile={profile}>
      <LocaleProvider locale={locale}>
        <div style={pageThemeStyle(profile, theme)} className="contents">
          <ProductPageView profile={profile} blocks={blocks} />
        </div>
      </LocaleProvider>
    </TenantThemeProvider>
  );
}
