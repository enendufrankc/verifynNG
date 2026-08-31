'use client';

import { useState } from 'react';
import type { FaqBlock as FaqBlockType } from '@verifynng/page-schema';

export function FaqBlock({ block }: { block: FaqBlockType }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (block.items.length === 0) return null;

  return (
    <section className="px-s5 py-s10 mx-auto max-w-2xl">
      <h2 className="mb-s6 text-center [font-family:var(--font-display,var(--font-sans))] text-2xl">
        Frequently asked questions
      </h2>
      <div className="border-border divide-border divide-y rounded-md border">
        {block.items.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                className="p-s4 flex w-full items-center justify-between text-left font-medium"
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : i)}
              >
                <span>{item.q}</span>
                <span aria-hidden className="text-fg-faint">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
              {isOpen && (
                <p className="text-fg-muted px-s4 pb-s4 text-sm">{item.a}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
