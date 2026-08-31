import type { IngredientsBlock as IngredientsBlockType } from '@verifynng/page-schema';

export function IngredientsBlock({ block }: { block: IngredientsBlockType }) {
  if (block.items.length === 0) return null;

  return (
    <section className="bg-surface-sunken px-s5 py-s10">
      {block.heading && (
        <h2 className="mb-s6 text-center [font-family:var(--font-display,var(--font-sans))] text-2xl">
          {block.heading}
        </h2>
      )}
      <ul className="gap-s3 mx-auto grid max-w-2xl sm:grid-cols-2">
        {block.items.map((item) => (
          <li
            key={item.name}
            className="border-border bg-surface p-s4 rounded-md border"
          >
            <div className="gap-s2 flex items-baseline justify-between">
              <span className="text-fg font-semibold">{item.name}</span>
              {item.percent !== undefined && (
                <span className="text-brand-text text-sm font-semibold">
                  {item.percent}%
                </span>
              )}
            </div>
            <p className="text-fg-muted mt-s1 text-sm">{item.role}</p>
            {item.note && (
              <p className="text-fg-faint mt-s1 text-xs">{item.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
