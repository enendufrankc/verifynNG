import { getTier1Renderer, type Tier1ProductSlotProps } from '@/lib/slots';
import { t } from '@/lib/i18n';

/** E09's default renderer; E10 overrides via `registerTier1Renderer()`. */
export function Tier1ProductSlot(props: Tier1ProductSlotProps) {
  const Renderer = getTier1Renderer();
  if (Renderer) return <Renderer {...props} />;

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
