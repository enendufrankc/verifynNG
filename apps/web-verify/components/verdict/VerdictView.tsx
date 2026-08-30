import { OkVerdict } from './OkVerdict';
import { AuthenticVerdict } from './AuthenticVerdict';
import { AlreadyVerifiedVerdict } from './AlreadyVerifiedVerdict';
import { SuspiciousVerdict } from './SuspiciousVerdict';
import { FlaggedVerdict } from './FlaggedVerdict';
import { DecommissionedVerdict } from './DecommissionedVerdict';
import { UnknownVerdict } from './UnknownVerdict';
import { InvalidVerdict } from './InvalidVerdict';
import { RateLimitedVerdict } from './RateLimitedVerdict';
import type { VerdictComponentProps } from './types';

/**
 * Dispatches E06's `verdict` string to its dedicated component. The
 * `default` branch assigns `data.verdict` to `never` — adding a verdict to
 * the union in lib/verdict.ts without a case here fails `tsc --noEmit`.
 */
export function VerdictView({
  data,
  redactedCode,
  supportUrl,
  locale,
  tenantSlug,
}: VerdictComponentProps & { tenantSlug: string }) {
  switch (data.verdict) {
    case 'ok':
      return (
        <OkVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
          tenantSlug={tenantSlug}
        />
      );
    case 'authentic':
      return (
        <AuthenticVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'already-verified':
      return (
        <AlreadyVerifiedVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'suspicious':
      return (
        <SuspiciousVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'flagged':
      return (
        <FlaggedVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'decommissioned':
      return (
        <DecommissionedVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'unknown':
      return (
        <UnknownVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'invalid':
      return (
        <InvalidVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    case 'rate-limited':
      return (
        <RateLimitedVerdict
          data={data}
          redactedCode={redactedCode}
          supportUrl={supportUrl}
          locale={locale}
        />
      );
    default: {
      const exhaustive: never = data.verdict;
      throw new Error(`unhandled verdict: ${String(exhaustive)}`);
    }
  }
}
