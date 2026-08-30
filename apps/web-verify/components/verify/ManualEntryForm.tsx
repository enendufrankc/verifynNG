'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeCodePreview, looksWellFormed } from '@/lib/normalize-preview';

/**
 * Progressive enhancement: without JS this is a plain `<form method="GET"
 * action="/verify">` — the server route reads `?code=` and redirects to
 * `/v/[normalized]`. With JS, submit is intercepted for a client
 * navigation straight to `/v/[normalized]`, and a live preview + a
 * non-blocking "doesn't look right" hint render as you type.
 */
export function ManualEntryForm() {
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const normalized = value.trim() ? normalizeCodePreview(value) : '';
  const showHint = normalized.length > 0 && !looksWellFormed(normalized);

  return (
    <form
      action="/verify"
      method="GET"
      onSubmit={(e) => {
        if (!normalized) return;
        e.preventDefault();
        startTransition(() => {
          router.push(`/v/${encodeURIComponent(normalized)}?src=manual`);
        });
      }}
      className="space-y-s4 w-full"
    >
      <div>
        <label htmlFor="code" className="text-fg block text-sm font-medium">
          Enter the code
        </label>
        <input
          id="code"
          name="code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ivoryglow-2-k1-abcd…"
          className="mt-s2 border-border bg-surface px-s4 py-s3 text-fg focus:border-brand w-full rounded-md border text-sm outline-none"
        />
        {normalized && (
          <p className="mt-s2 text-fg-muted text-xs">
            We read this as{' '}
            <span className="text-fg font-mono">{normalized}</span>
          </p>
        )}
        {showHint && (
          <p className="mt-s1 text-warning text-xs">
            That doesn&rsquo;t look like a complete code — check for typos.
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="bg-brand py-s3 text-brand-ink w-full rounded-md text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
      >
        Verify
      </button>
    </form>
  );
}
