'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { GalleryBlock as GalleryBlockType } from '@verifynng/page-schema';

export function GalleryBlock({ block }: { block: GalleryBlockType }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (block.items.length === 0) return null;

  return (
    <section className="px-s5 py-s10">
      {block.heading && (
        <h2 className="mb-s6 text-center [font-family:var(--font-display,var(--font-sans))] text-2xl">
          {block.heading}
        </h2>
      )}
      <div className="gap-s3 mx-auto grid max-w-3xl grid-cols-2 sm:grid-cols-3">
        {block.items.map((item, i) => (
          <button
            key={item.media.assetId}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="focus:ring-focus overflow-hidden rounded-md focus:ring-2 focus:outline-none"
          >
            <Image
              src={item.media.variants.webp[0] ?? ''}
              alt={item.media.alt}
              width={item.media.width}
              height={item.media.height}
              className="aspect-square h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="p-s5 fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setOpenIndex(null)}
        >
          <figure className="max-h-full max-w-full">
            <Image
              src={
                block.items[openIndex].media.variants.webp[
                  block.items[openIndex].media.variants.webp.length - 1
                ] ?? ''
              }
              alt={block.items[openIndex].media.alt}
              width={block.items[openIndex].media.width}
              height={block.items[openIndex].media.height}
              className="max-h-[80vh] w-auto rounded-md"
            />
            {block.items[openIndex].caption && (
              <figcaption className="mt-s2 text-center text-sm text-white">
                {block.items[openIndex].caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </section>
  );
}
