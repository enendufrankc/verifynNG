import type { VerificationEducationBlock as VerificationEducationBlockType } from '@verifynng/page-schema';

const STEPS = [
  'Scan the QR code printed on your product with your phone camera.',
  'We check the code against the brand’s registry in real time.',
  'You see an instant verdict — genuine, or a reason to be cautious.',
];

export function VerificationEducationBlock({
  block,
}: {
  block: VerificationEducationBlockType;
}) {
  return (
    <section className="bg-surface-sunken px-s5 py-s10 text-center">
      <h2 className="mb-s3 [font-family:var(--font-display,var(--font-sans))] text-2xl">
        {block.heading ?? 'How verification works'}
      </h2>
      {block.body && (
        <p className="text-fg-muted mb-s6 mx-auto max-w-xl">{block.body}</p>
      )}
      <ol className="gap-s3 mx-auto grid max-w-2xl text-left sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className="border-border bg-surface p-s4 rounded-md border text-sm"
          >
            <span className="text-brand-text font-semibold">{i + 1}.</span>{' '}
            {step}
          </li>
        ))}
      </ol>
      {block.showManualEntryLink && (
        <a
          href="/verify"
          className="text-brand-text mt-s6 inline-block font-semibold underline"
        >
          Enter your code manually
        </a>
      )}
    </section>
  );
}
