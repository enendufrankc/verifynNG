import type { Block } from '@verifynng/page-schema';
import type { TenantPublicProfile } from '@/lib/api';
import { BlockRenderer } from './BlockRenderer';
import type { BatchContext } from './blocks/BatchInfoBlock';

/**
 * Full standalone page (T6): topbar + the tenant's ordered blocks. The root
 * layout already renders the single page <main> landmark and the tenant
 * footer for every route (same as /v/[code] and /verify) — a second
 * <main>/<TenantFooter> here would duplicate both landmarks.
 */
export function ProductPageView({
  profile,
  blocks,
  batchContext,
}: {
  profile: TenantPublicProfile;
  blocks: Block[];
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

      <div className="flex-1">
        {blocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            batchContext={batchContext}
          />
        ))}
      </div>
    </div>
  );
}
