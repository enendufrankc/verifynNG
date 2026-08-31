import type { Tier1ProductSlotProps } from '@/lib/slots';
import { t } from '@/lib/i18n';
import { getTier1Page } from '@/lib/product-page/page-fetcher';
import { HeroBlock } from './blocks/HeroBlock';
import { BatchInfoBlock } from './blocks/BatchInfoBlock';
import { VerificationEducationBlock } from './blocks/VerificationEducationBlock';
import { LinksBlock } from './blocks/LinksBlock';
import type {
  BatchInfoBlock as BatchInfoBlockType,
  HeroBlock as HeroBlockType,
  LinksBlock as LinksBlockType,
  VerificationEducationBlock as VerificationEducationBlockType,
} from '@verifynng/page-schema';

/** E09's default rows, reproduced here — once a renderer is registered
 * (see lib/slots.ts) it fully replaces the default slot for every render,
 * so the "no published page" fallback has to live in this component. */
function DefaultSlotFallback(props: Tier1ProductSlotProps) {
  const { locale } = props;
  const rows = [
    props.productName && {
      label: t(locale, 'verdict.row.product'),
      value: props.productName,
    },
    props.batchId && {
      label: t(locale, 'verdict.row.batch'),
      value: props.batchId,
    },
    props.commissionedAt && {
      label: t(locale, 'verdict.row.commissioned'),
      value: new Date(props.commissionedAt).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
      }),
    },
    props.oemName && {
      label: t(locale, 'verdict.row.manufacturer'),
      value: props.oemName,
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  if (rows.length === 0) return null;
  return (
    <dl className="space-y-s2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between">
          <dt className="text-fg-muted">{row.label}</dt>
          <dd className="text-fg font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * T7 — registered via `registerTier1Renderer` in lib/slots.ts. Renders a
 * compact subset (hero w/o CTA → batch-info auto → verification-education
 * auto → link to the full page → links) when the scanned product has a
 * published page; falls back to E09's default rows otherwise.
 */
export async function ProductPageTier1Renderer(props: Tier1ProductSlotProps) {
  if (!props.productId) return <DefaultSlotFallback {...props} />;

  const result = await getTier1Page(props.tenantSlug, props.productId);
  if (!result.ok) return <DefaultSlotFallback {...props} />;

  const { blocks, meta } = result.data;
  const hero = blocks.find((b): b is HeroBlockType => b.type === 'hero');
  const batchInfo = blocks.find(
    (b): b is BatchInfoBlockType => b.type === 'batch-info',
  );
  const education = blocks.find(
    (b): b is VerificationEducationBlockType =>
      b.type === 'verification-education',
  );
  const links = blocks.find((b): b is LinksBlockType => b.type === 'links');

  const batchContext = props.batchId
    ? {
        batchId: props.batchId,
        oemLabel: props.oemName,
        commissionedAt: props.commissionedAt,
      }
    : undefined;

  return (
    <div className="space-y-s5">
      {hero && (
        <HeroBlock
          block={{ ...hero, ctaPrimary: undefined, ctaSecondary: undefined }}
        />
      )}
      {batchInfo && <BatchInfoBlock block={batchInfo} context={batchContext} />}
      {education && <VerificationEducationBlock block={education} />}
      <a
        href={`/p/${meta.tenantSlug}/${meta.productSlug}`}
        className="text-brand-text block text-center font-semibold underline"
      >
        See full product page
      </a>
      {links && <LinksBlock block={links} />}
    </div>
  );
}
