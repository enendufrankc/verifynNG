/**
 * Colour references for the analytics charts — plain `var(--color-*)`
 * strings, which recharts (and raw SVG) accept anywhere a CSS colour is
 * expected. Verdict colours reuse E09's tokens (see status-chip.tsx) so a
 * verdict reads the same whether it's a chip or a chart series.
 */
export const CHART_PALETTE = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
] as const;

const VERDICT_COLORS: Record<string, string> = {
  ok: 'var(--color-v-pos)',
  authentic: 'var(--color-v-pos)',
  'already-verified': 'var(--color-v-hist)',
  suspicious: 'var(--color-v-susp)',
  flagged: 'var(--color-v-flag)',
  decommissioned: 'var(--color-v-dec)',
  unknown: 'var(--color-v-unk)',
  invalid: 'var(--color-v-flag)',
  'rate-limited': 'var(--color-v-util)',
};

export function verdictColor(verdict: string): string {
  return VERDICT_COLORS[verdict] ?? 'var(--color-v-util)';
}
