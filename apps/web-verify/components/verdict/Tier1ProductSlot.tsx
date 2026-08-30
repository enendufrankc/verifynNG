import { getTier1Renderer, type Tier1ProductSlotProps } from '@/lib/slots';

/** E09's default renderer; E10 overrides via `registerTier1Renderer()`. */
export function Tier1ProductSlot(props: Tier1ProductSlotProps) {
  const Renderer = getTier1Renderer();
  if (Renderer) return <Renderer {...props} />;

  const rows = [
    props.productName && { label: 'Product', value: props.productName },
    props.batchId && { label: 'Batch', value: props.batchId },
    props.commissionedAt && {
      label: 'Commissioned',
      value: new Date(props.commissionedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
      }),
    },
    props.oemName && { label: 'Manufacturer', value: props.oemName },
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
