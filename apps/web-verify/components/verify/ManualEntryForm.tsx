'use client';

import { useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { normalizeCodePreview, looksWellFormed } from '@/lib/normalize-preview';
import { t, type Locale } from '@/lib/i18n';

// Client-only: touches navigator.mediaDevices / window.BarcodeDetector,
// neither of which exist during SSR. Lazy chunk — never loaded unless the
// user taps "Scan with camera" (T13 budget).
const CameraScanner = dynamic(
  () =>
    import('@/components/scanner/CameraScanner').then((m) => m.CameraScanner),
  { ssr: false },
);

/**
 * Progressive enhancement: without JS this is a plain `<form method="GET"
 * action="/verify">` — the server route reads `?code=` and redirects to
 * `/v/[normalized]`. With JS, submit is intercepted for a client
 * navigation straight to `/v/[normalized]`, and a live preview + a
 * non-blocking "doesn't look right" hint render as you type.
 */
export function ManualEntryForm({ locale }: { locale: Locale }) {
  const [value, setValue] = useState('');
  const [isPending, startTransition] = useTransition();
  const [scannerOpen, setScannerOpen] = useState(false);
  const router = useRouter();

  const normalized = value.trim() ? normalizeCodePreview(value) : '';
  const showHint = normalized.length > 0 && !looksWellFormed(normalized);

  if (scannerOpen) {
    return <CameraScanner onClose={() => setScannerOpen(false)} />;
  }

  return (
    <div className="space-y-s4 w-full">
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
            {t(locale, 'verify.form.label')}
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
            placeholder={t(locale, 'verify.form.placeholder')}
            className="mt-s2 border-border bg-surface px-s4 py-s3 text-fg focus:border-brand w-full rounded-md border text-sm outline-none"
          />
          {normalized && (
            <p className="mt-s2 text-fg-muted text-xs">
              {t(locale, 'verify.form.preview', { code: '' })}
              <span className="text-fg font-mono">{normalized}</span>
            </p>
          )}
          {showHint && (
            <p className="mt-s1 text-warning text-xs">
              {t(locale, 'verify.form.hint')}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand py-s3 text-brand-ink w-full rounded-md text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
        >
          {t(locale, 'verify.form.submit')}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setScannerOpen(true)}
        className="border-border text-fg py-s3 gap-s2 flex w-full items-center justify-center rounded-md border text-sm font-semibold transition hover:opacity-90"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        {t(locale, 'scanner.openCta')}
      </button>
    </div>
  );
}
