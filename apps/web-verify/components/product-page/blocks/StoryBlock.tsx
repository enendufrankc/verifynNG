import type { StoryBlock as StoryBlockType } from '@verifynng/page-schema';

export function StoryBlock({ block }: { block: StoryBlockType }) {
  return (
    <section className="px-s5 py-s16 mx-auto max-w-2xl text-center">
      {block.kicker && (
        <p className="text-brand-text mb-s2 text-xs font-semibold tracking-[0.2em] uppercase">
          {block.kicker}
        </p>
      )}
      <h2 className="mb-s6 [font-family:var(--font-display,var(--font-sans))] text-3xl">
        {block.heading}
      </h2>
      <div className="text-fg-muted space-y-s4">
        {block.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {block.attribution && (
        <p className="text-fg-faint mt-s6 text-sm italic">
          — {block.attribution}
        </p>
      )}
    </section>
  );
}
