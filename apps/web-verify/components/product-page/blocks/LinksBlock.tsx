import type { LinksBlock as LinksBlockType } from '@verifynng/page-schema';

export function LinksBlock({ block }: { block: LinksBlockType }) {
  if (block.items.length === 0) return null;

  return (
    <section className="px-s5 py-s10 mx-auto max-w-md">
      <div className="gap-s3 flex flex-col">
        {block.items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target={item.kind === 'social' ? '_blank' : undefined}
            rel={item.kind === 'social' ? 'noopener noreferrer' : undefined}
            className="border-border bg-surface hover:bg-surface-sunken p-s4 rounded-md border text-center font-semibold"
          >
            {item.label}
          </a>
        ))}
      </div>
    </section>
  );
}
