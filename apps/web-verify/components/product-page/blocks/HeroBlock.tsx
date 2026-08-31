import type { HeroBlock as HeroBlockType } from '@verifynng/page-schema';
import { MediaImage } from '../MediaImage';

export function HeroBlock({ block }: { block: HeroBlockType }) {
  return (
    <section className="bg-brand-ink px-s5 pt-s10 pb-s16 text-center text-white">
      {block.eyebrow && (
        <p className="text-brand mb-s2 text-xs font-semibold tracking-[0.2em] uppercase">
          {block.eyebrow}
        </p>
      )}
      <h1 className="mx-auto max-w-2xl [font-family:var(--font-display,var(--font-sans))] text-4xl leading-tight sm:text-5xl">
        {block.title}
      </h1>
      {block.subtitle && (
        <p className="mt-s3 mx-auto max-w-xl text-white/80">{block.subtitle}</p>
      )}

      <div className="mt-s10 relative mx-auto max-w-xs">
        <MediaImage
          media={block.image}
          priority
          className="mx-auto rounded-lg shadow-lg"
        />
      </div>

      {block.stats && block.stats.length > 0 && (
        <dl className="mt-s10 gap-s8 flex flex-wrap justify-center">
          {block.stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-brand [font-family:var(--font-display,var(--font-sans))] text-2xl">
                {stat.value}
              </dt>
              <dd className="mt-s1 text-xs text-white/70">{stat.label}</dd>
            </div>
          ))}
        </dl>
      )}

      {(block.ctaPrimary || block.ctaSecondary) && (
        <div className="mt-s8 gap-s3 flex flex-wrap justify-center">
          {block.ctaPrimary && (
            <a
              href={block.ctaPrimary.href}
              className="bg-brand text-brand-ink px-s6 py-s3 rounded-full font-semibold"
            >
              {block.ctaPrimary.label}
            </a>
          )}
          {block.ctaSecondary && (
            <a
              href={block.ctaSecondary.href}
              className="px-s6 py-s3 rounded-full border border-white/30 font-semibold text-white"
            >
              {block.ctaSecondary.label}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
