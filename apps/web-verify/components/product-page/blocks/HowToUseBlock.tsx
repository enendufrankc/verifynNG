import type { HowToUseBlock as HowToUseBlockType } from '@verifynng/page-schema';

export function HowToUseBlock({ block }: { block: HowToUseBlockType }) {
  if (block.steps.length === 0) return null;

  return (
    <section className="px-s5 py-s10">
      {block.heading && (
        <h2 className="mb-s6 text-center [font-family:var(--font-display,var(--font-sans))] text-2xl">
          {block.heading}
        </h2>
      )}
      <ol className="gap-s4 mx-auto grid max-w-3xl sm:grid-cols-3">
        {block.steps.map((step, i) => (
          <li key={step.title} className="text-center">
            <div className="bg-brand text-brand-ink mb-s3 h-s10 w-s10 mx-auto flex items-center justify-center rounded-full font-semibold">
              {i + 1}
            </div>
            <h3 className="text-fg font-semibold">{step.title}</h3>
            <p className="text-fg-muted mt-s1 text-sm">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
