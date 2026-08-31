'use client';

import { useState } from 'react';
import { Button } from '@verifyng/ui';
import { BLOCK_TYPES, type BlockType } from '@verifynng/page-schema';
import { PlusIcon } from 'lucide-react';

const DESCRIPTIONS: Record<BlockType, string> = {
  hero: 'Title, subtitle, stats, CTAs and a hero image',
  'rich-text': 'Freeform sanitised markdown',
  story: 'Brand or product narrative',
  gallery: 'Photo grid with lightbox',
  ingredients: 'Ingredient list with % and role',
  'how-to-use': 'Numbered ritual/usage steps',
  'batch-info': 'Auto — scanned unit batch/OEM/date',
  'verification-education': 'Auto — how verification works',
  faq: 'Accordion of questions and answers',
  links: 'External links (store/social/support)',
  registration: 'Regulatory "on the record" section',
  trademark: 'Registered marks',
};

export function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Add block
      </Button>
      {open && (
        <div className="border-border bg-surface absolute z-10 mt-1 w-72 space-y-1 rounded-md border p-2 shadow-lg">
          {BLOCK_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="hover:bg-surface-sunken block w-full rounded-md p-2 text-left"
              onClick={() => {
                onAdd(type);
                setOpen(false);
              }}
            >
              <p className="text-sm font-medium">{type}</p>
              <p className="text-fg-muted text-xs">{DESCRIPTIONS[type]}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
