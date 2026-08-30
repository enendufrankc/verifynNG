/**
 * Local mirror of E06's verdict contract (apps/api/src/modules/verify/verdict-engine.ts).
 * E09 doesn't import E06's internal code — the wire shape is re-declared here
 * and validated at the boundary by lib/api.ts's Zod schema, so this file is
 * the one place a new verdict has to be added for the app to typecheck.
 */
export const VERDICTS = [
  'invalid',
  'unknown',
  'ok',
  'authentic',
  'already-verified',
  'suspicious',
  'flagged',
  'decommissioned',
  'rate-limited',
] as const;

export type Verdict = (typeof VERDICTS)[number];

export const SEVERITIES = ['green', 'amber', 'red', 'grey'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * A "client-side only" state for when the API couldn't be reached at all —
 * never returned by E06, never treated as a verdict. Kept in the same union
 * as `Verdict` for components that render both (VerdictFrame).
 */
export const ERROR_STATE = 'error' as const;
export type VerdictOrError = Verdict | typeof ERROR_STATE;

/**
 * The seven-hue verdict palette from docs/design/README.md ("Verdict enum
 * reconciliation"), already implemented as CSS custom properties in
 * packages/ui/src/tokens.css and exposed as Tailwind colours by
 * tailwind-preset.ts (`v-pos`, `v-hist`, `v-susp`, `v-flag`, `v-dec`,
 * `v-unk`, `v-util`). `severity` still drives coarse behaviour (report CTA
 * via `reportable`, retry logic); this drives the "nine distinct
 * components" visual requirement (T4) so verdicts sharing a severity
 * (e.g. `flagged`/`decommissioned`/`unknown` are all `red`) still read as
 * different bands for colour-blind readers.
 */
export type VerdictTone =
  | 'pos'
  | 'hist'
  | 'susp'
  | 'flag'
  | 'dec'
  | 'unk'
  | 'util';

export function verdictTone(verdict: VerdictOrError): VerdictTone {
  switch (verdict) {
    case 'ok':
    case 'authentic':
      return 'pos';
    case 'already-verified':
      return 'hist';
    case 'suspicious':
      return 'susp';
    case 'flagged':
      return 'flag';
    case 'decommissioned':
      return 'dec';
    case 'unknown':
      return 'unk';
    case 'invalid':
    case 'rate-limited':
    case 'error':
      return 'util';
    default: {
      const exhaustive: never = verdict;
      throw new Error(`unhandled verdict: ${String(exhaustive)}`);
    }
  }
}

/**
 * Literal Tailwind class strings — kept as static strings (not template
 * interpolation) so Tailwind's content scanner can find them. Atomic fields
 * so callers compose their own combinations (band strip, tinted badge with
 * a solid border/icon, coloured title).
 */
export const TONE_CLASSES: Record<
  VerdictTone,
  { solidBg: string; tintBg: string; border: string; text: string }
> = {
  pos: {
    solidBg: 'bg-v-pos',
    tintBg: 'bg-v-pos-tint',
    border: 'border-v-pos',
    text: 'text-v-pos',
  },
  hist: {
    solidBg: 'bg-v-hist',
    tintBg: 'bg-v-hist-tint',
    border: 'border-v-hist',
    text: 'text-v-hist',
  },
  susp: {
    solidBg: 'bg-v-susp',
    tintBg: 'bg-v-susp-tint',
    border: 'border-v-susp',
    text: 'text-v-susp',
  },
  flag: {
    solidBg: 'bg-v-flag',
    tintBg: 'bg-v-flag-tint',
    border: 'border-v-flag',
    text: 'text-v-flag',
  },
  dec: {
    solidBg: 'bg-v-dec',
    tintBg: 'bg-v-dec-tint',
    border: 'border-v-dec',
    text: 'text-v-dec',
  },
  unk: {
    solidBg: 'bg-v-unk',
    tintBg: 'bg-v-unk-tint',
    border: 'border-v-unk',
    text: 'text-v-unk',
  },
  util: {
    solidBg: 'bg-v-util',
    tintBg: 'bg-v-util-tint',
    border: 'border-v-util',
    text: 'text-v-util',
  },
};
