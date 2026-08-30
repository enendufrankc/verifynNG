import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { cache } from 'react';
import { normalizeCode, parseCode } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { verifyCode, getTenantPublicProfile } from '@/lib/api';
import { redactCode } from '@/lib/redact';
import { VerdictView } from '@/components/verdict/VerdictView';
import { ErrorVerdict } from '@/components/verdict/ErrorVerdict';
import { ShareSafeUrl } from '@/components/tenant/ShareSafeUrl';
import { TenantThemeProvider } from '@/components/tenant/ThemeProvider';
import { PageBeacon } from '@/components/analytics/PageBeacon';

// One server call per landing, at request time — never cached, never a
// stale verdict (T3).
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ src?: string }>;
}

type Src = 'qr' | 'manual' | 'sms';

function toSrc(value: string | undefined): Src {
  return value === 'manual' || value === 'sms' ? value : 'qr';
}

/**
 * `React.cache` memoizes this per request, so `generateMetadata` and the
 * page component below share one call to E06 even though both read it.
 */
const loadVerify = cache(
  async (
    normalizedCode: string,
    ip: string | null,
    userAgent: string | null,
    src: Src,
  ) => verifyCode(normalizedCode, { ip, userAgent, src }),
);

async function resolveRequest(
  params: PageProps['params'],
  searchParams: PageProps['searchParams'],
) {
  const [{ code: rawCode }, query] = await Promise.all([params, searchParams]);
  const normalized = normalizeCode(rawCode);
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = h.get('user-agent');
  const result = await loadVerify(normalized, ip, userAgent, toSrc(query.src));
  return { normalized, result };
}

function resolveTenantSlug(
  normalized: string,
  result: Awaited<ReturnType<typeof loadVerify>>,
): string {
  const fromResponse = result.ok ? result.data.brand?.slug : undefined;
  return (
    fromResponse ??
    parseCode(normalized)?.tenant ??
    loadEnv().NEXT_PUBLIC_DEFAULT_TENANT
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { normalized, result } = await resolveRequest(params, searchParams);
  const tenantSlug = resolveTenantSlug(normalized, result);
  const profile = await getTenantPublicProfile(tenantSlug);
  const verdictLabel = result.ok ? result.data.verdict : 'error';

  return {
    title: `${profile.name} — verification`,
    description: `Verification result: ${verdictLabel}`,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${profile.name} verification`,
      ...(profile.logoUrl ? { images: [{ url: profile.logoUrl }] } : {}),
    },
  };
}

export default async function VerifyCodePage({
  params,
  searchParams,
}: PageProps) {
  const { normalized, result } = await resolveRequest(params, searchParams);
  const redacted = redactCode(normalized);
  const tenantSlug = resolveTenantSlug(normalized, result);
  const profile = await getTenantPublicProfile(tenantSlug);

  if (!result.ok) {
    return (
      <TenantThemeProvider profile={profile}>
        <PageBeacon tenantSlug={tenantSlug} />
        <ErrorVerdict retryHref={`/v/${encodeURIComponent(normalized)}`} />
      </TenantThemeProvider>
    );
  }

  return (
    <TenantThemeProvider profile={profile}>
      <ShareSafeUrl redactedCode={redacted} />
      <PageBeacon
        tenantSlug={tenantSlug}
        verdict={result.data.verdict}
        tier={result.data.tier}
      />
      <VerdictView
        data={result.data}
        redactedCode={redacted}
        supportUrl={profile.supportUrl}
        tenantSlug={tenantSlug}
      />
    </TenantThemeProvider>
  );
}
