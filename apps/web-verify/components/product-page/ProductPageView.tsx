import type { Block } from '@verifynng/page-schema';
import type { TenantPublicProfile } from '@/lib/api';
import { TenantFooter } from '@/components/tenant/TenantFooter';
import { type Locale } from '@/lib/i18n';
import { BlockRenderer } from './BlockRenderer';
import type { BatchContext } from './blocks/BatchInfoBlock';

/** Full standalone page (T6): topbar, the tenant's ordered blocks, footer. */
export function ProductPageView({
  profile,
  blocks,
  locale,
  batchContext,
}: {
  profile: TenantPublicProfile;
  blocks: Block[];
  locale: Locale;
  batchContext?: BatchContext;
}) {
  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <header className="border-border/50 px-s5 py-s3 flex items-center justify-center border-b">
        {profile.logoUrl ? (
          <img src={profile.logoUrl} alt={profile.name} className="h-s8" />
        ) : (
          <span className="text-fg font-semibold tracking-wide">
            {profile.name}
          </span>
        )}
      </header>

      <main className="flex-1">
        {blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            batchContext={batchContext}
          />
        ))}
      </main>

      <TenantFooter profile={profile} locale={locale} />
    </div>
  );
}
