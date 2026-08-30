import { t, type Locale } from '@/lib/i18n';

/**
 * Placeholder for E08's `ReportForm` (packages/ui) + `POST /v1/reports`,
 * neither of which exists on `main` yet — see the E06 change request in
 * docs/epics/E09-verify-web.md ("Consumes"). Swap this for
 * `<ReportForm tenantSlug redactedCode verdict scanEventId />` once E08
 * ships; mounted in the same place (verdicts where `reportable` is true).
 */
export function ReportPrompt({
  supportUrl,
  locale,
}: {
  supportUrl?: string;
  locale: Locale;
}) {
  return (
    <div className="mt-s6 bg-surface-sunken border-border p-s4 rounded-md border text-sm">
      <p className="text-fg font-medium">{t(locale, 'report.prompt.title')}</p>
      <p className="mt-s1 text-fg-muted">
        {supportUrl ? (
          <>
            {t(locale, 'report.prompt.withSupport', { supportUrl: '' })}
            <a className="underline" href={supportUrl}>
              {supportUrl}
            </a>
          </>
        ) : (
          t(locale, 'report.prompt.withoutSupport')
        )}
      </p>
    </div>
  );
}
