import Link from 'next/link';
import { Tier1ProductSlot } from '@/components/verdict/Tier1ProductSlot';
import type { VerifyResponse } from '@/lib/api';

const STEPS = [
  'Look under the cap, or behind the scratch-off panel on the back label.',
  'Scratch gently to reveal a second, longer code.',
  'Enter that code below for full unit-level verification.',
];

/**
 * Tier-1 "find the hidden code" teaching panel — mounted only under the
 * `ok` verdict (public QR, product-line-level scan). Mounts the
 * Tier1ProductSlot boundary above the steps.
 */
export function EducationPanel({
  data,
  tenantSlug,
}: {
  data: VerifyResponse;
  tenantSlug: string;
}) {
  return (
    <div className="mt-s6 border-border pt-s6 border-t">
      <Tier1ProductSlot
        tenantSlug={tenantSlug}
        productId={data.product?.id}
        batchId={data.batch?.id}
        productName={data.product?.name}
        oemName={data.batch?.oem}
        commissionedAt={data.batch?.commissionedAt}
      />
      <h2 className="mt-s6 text-fg text-sm font-semibold">
        Find the hidden code for full authentication
      </h2>
      <ol className="mt-s3 space-y-s2 pl-s5 text-fg-muted list-decimal text-sm">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Link
        href="/verify?tier=2"
        className="mt-s5 bg-brand py-s3 text-brand-ink block w-full rounded-md text-center text-sm font-semibold transition hover:opacity-90"
      >
        I found it — enter it
      </Link>
    </div>
  );
}
