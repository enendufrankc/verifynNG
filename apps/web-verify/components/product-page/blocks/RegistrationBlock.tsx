import type { RegistrationBlock as RegistrationBlockType } from '@verifynng/page-schema';

export function RegistrationBlock({ block }: { block: RegistrationBlockType }) {
  if (
    block.items.length === 0 &&
    (!block.cautions || block.cautions.length === 0)
  )
    return null;

  return (
    <section className="bg-surface-sunken px-s5 py-s10 mx-auto max-w-2xl text-sm">
      {block.heading && (
        <h2 className="mb-s4 font-semibold">{block.heading}</h2>
      )}
      {block.items.length > 0 && (
        <dl className="space-y-s2">
          {block.items.map((item) => (
            <div key={item.label} className="gap-s3 flex justify-between">
              <dt className="text-fg-muted">{item.label}</dt>
              <dd className="text-fg text-right font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {block.cautions && block.cautions.length > 0 && (
        <ul className="text-fg-faint mt-s4 space-y-s1 pl-s5 list-disc">
          {block.cautions.map((caution) => (
            <li key={caution}>{caution}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
