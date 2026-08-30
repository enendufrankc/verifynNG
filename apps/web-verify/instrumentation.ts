export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.SENTRY_DSN) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sentry = require('@sentry/nextjs');
        Sentry.init({
          dsn: process.env.SENTRY_DSN,
          tracesSampleRate: 1.0,
        });
      } catch {
        // Fallback when Sentry is not installed
      }
    }
  }
}
