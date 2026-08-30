import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 preset for @verifyng/ui.
 *
 * Maps every design token defined in `src/tokens.css` to Tailwind
 * utility classes via CSS variables. Apps import this preset and
 * also `@verifyng/ui/tokens.css` so the variables resolve.
 */
export default {
  theme: {
    colors: {
      // ── neutral ramp ───────────────────────────────────
      n0: 'var(--color-n0)',
      n50: 'var(--color-n50)',
      n100: 'var(--color-n100)',
      n200: 'var(--color-n200)',
      n300: 'var(--color-n300)',
      n400: 'var(--color-n400)',
      n500: 'var(--color-n500)',
      n600: 'var(--color-n600)',
      n700: 'var(--color-n700)',
      n800: 'var(--color-n800)',
      n900: 'var(--color-n900)',
      n1000: 'var(--color-n1000)',

      // ── brand / turquoise ──────────────────────────────
      tq: 'var(--color-tq)',
      'tq-dark': 'var(--color-tq-dark)',
      'tq-500': 'var(--color-tq-500)',
      'tq-light': 'var(--color-tq-light)',

      // ── accent colours ─────────────────────────────────
      orange: 'var(--color-orange)',
      red: 'var(--color-red)',
      'red-light': 'var(--color-red-light)',
      green: 'var(--color-green)',
      'green-dark': 'var(--color-green-dark)',
      'blue-light': 'var(--color-blue-light)',

      // ── verdict family ─────────────────────────────────
      'v-pos': 'var(--color-v-pos)',
      'v-pos-tint': 'var(--color-v-pos-tint)',
      'v-hist': 'var(--color-v-hist)',
      'v-hist-tint': 'var(--color-v-hist-tint)',
      'v-susp': 'var(--color-v-susp)',
      'v-susp-tint': 'var(--color-v-susp-tint)',
      'v-flag': 'var(--color-v-flag)',
      'v-flag-tint': 'var(--color-v-flag-tint)',
      'v-dec': 'var(--color-v-dec)',
      'v-dec-tint': 'var(--color-v-dec-tint)',
      'v-unk': 'var(--color-v-unk)',
      'v-unk-tint': 'var(--color-v-unk-tint)',
      'v-util': 'var(--color-v-util)',
      'v-util-tint': 'var(--color-v-util-tint)',

      // ── semantic aliases ──────────────────────────────
      bg: 'var(--color-bg)',
      surface: 'var(--color-surface)',
      'surface-sunken': 'var(--color-surface-sunken)',
      fg: 'var(--color-fg)',
      'fg-muted': 'var(--color-fg-muted)',
      'fg-faint': 'var(--color-fg-faint)',
      border: 'var(--color-border)',
      'border-strong': 'var(--color-border-strong)',
      brand: 'var(--color-brand)',
      'brand-ink': 'var(--color-brand-ink)',
      'brand-text': 'var(--color-brand-text)',
      'brand-strong': 'var(--color-brand-strong)',
      focus: 'var(--color-focus)',
      success: 'var(--color-success)',
      warning: 'var(--color-warning)',
      danger: 'var(--color-danger)',
      info: 'var(--color-info)',

      // ── chart tokens ───────────────────────────────────
      'chart-1': 'var(--color-chart-1)',
      'chart-2': 'var(--color-chart-2)',
      'chart-3': 'var(--color-chart-3)',
      'chart-4': 'var(--color-chart-4)',
      'chart-5': 'var(--color-chart-5)',
      'chart-6': 'var(--color-chart-6)',
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    borderRadius: {
      xs: 'var(--radius-xs)',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      full: 'var(--radius-full)',
    },
    boxShadow: {
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
    },
  },
} satisfies Config;
