import type { TrademarkBlock as TrademarkBlockType } from '@verifynng/page-schema';
import { MediaImage } from '../MediaImage';

export function TrademarkBlock({ block }: { block: TrademarkBlockType }) {
  if (block.marks.length === 0) return null;

  return (
    <section className="text-fg-faint px-s5 py-s10 mx-auto max-w-2xl text-xs">
      {block.heading && (
        <h2 className="text-fg-muted mb-s3 font-semibold">{block.heading}</h2>
      )}
      <ul className="space-y-s3">
        {block.marks.map((mark) => (
          <li key={mark.number} className="gap-s3 flex items-center">
            {mark.imageRef && (
              <MediaImage
                media={mark.imageRef}
                className="h-s8 w-s8 object-contain"
              />
            )}
            <span>
              {mark.name} — Reg. No. {mark.number}, Class {mark.class},{' '}
              {mark.jurisdiction}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
