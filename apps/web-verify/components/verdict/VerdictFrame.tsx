import type { ReactNode } from 'react';
import { TONE_CLASSES, type VerdictTone } from '@/lib/verdict';

export interface VerdictRow {
  label: string;
  value: ReactNode;
}

export interface VerdictFrameProps {
  tone: VerdictTone;
  icon: ReactNode;
  title: string;
  message: string;
  tier?: 1 | 2;
  rows?: VerdictRow[];
  children?: ReactNode;
}

const TIER_LABEL: Record<1 | 2, string> = {
  1: 'Public QR · Product line',
  2: 'Hidden code · Unit verification',
};

/**
 * The shared card shell every verdict component renders through — badge,
 * title, message, rows, tier tag. Four channels distinguish a verdict
 * (docs/design/README.md): the colour band, the badge icon, the plain-
 * language title/message, and (here) the border — colour is never the only
 * signal.
 */
export function VerdictFrame({
  tone,
  icon,
  title,
  message,
  tier,
  rows,
  children,
}: VerdictFrameProps) {
  const cls = TONE_CLASSES[tone];

  return (
    <section
      className="border-border bg-surface relative w-full max-w-md overflow-hidden rounded-lg border shadow-lg"
      aria-live="polite"
    >
      <div className={`h-1.5 w-full ${cls.solidBg}`} aria-hidden="true" />
      <div className="p-s8">
        {tier && (
          <span className="right-s4 top-s4 bg-surface-sunken px-s3 py-s1 text-fg-muted absolute rounded-full text-[10px] font-semibold tracking-widest uppercase">
            {TIER_LABEL[tier]}
          </span>
        )}
        <div
          className={`mb-s5 mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 ${cls.tintBg} ${cls.border} ${cls.text}`}
        >
          {icon}
        </div>
        <h1
          className={`text-center font-sans text-2xl font-semibold ${cls.text}`}
        >
          {title}
        </h1>
        <p className="mt-s3 text-fg-muted text-center text-sm">{message}</p>
        {rows && rows.length > 0 && (
          <dl className="mt-s6 border-border grid gap-0 border-t">
            {rows.map((row) => (
              <div
                key={row.label}
                className="gap-s3 border-border py-s3 flex items-center justify-between border-b text-sm"
              >
                <dt className="text-fg-muted">{row.label}</dt>
                <dd className="text-fg text-right font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}
