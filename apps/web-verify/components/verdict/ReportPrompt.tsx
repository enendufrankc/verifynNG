/**
 * Placeholder for E08's `ReportForm` (packages/ui) + `POST /v1/reports`,
 * neither of which exists on `main` yet — see the E06 change request in
 * docs/epics/E09-verify-web.md ("Consumes"). Swap this for
 * `<ReportForm tenantSlug redactedCode verdict scanEventId />` once E08
 * ships; mounted in the same place (verdicts where `reportable` is true).
 */
export function ReportPrompt({ supportUrl }: { supportUrl?: string }) {
  return (
    <div className="mt-s6 border-border bg-surface-sunken p-s4 rounded-md border text-sm">
      <p className="text-fg font-medium">Think this might be counterfeit?</p>
      <p className="mt-s1 text-fg-muted">
        {supportUrl ? (
          <>
            Report it to the brand —{' '}
            <a className="underline" href={supportUrl}>
              {supportUrl}
            </a>
          </>
        ) : (
          'Report it to the brand or your point of purchase.'
        )}
      </p>
    </div>
  );
}
