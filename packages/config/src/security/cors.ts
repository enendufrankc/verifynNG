/**
 * CORS allowlist configuration for the Verify Platform.
 *
 * Each app (admin, verify, api) has its own set of allowed origins
 * read from environment variables.
 */

export type CorsApp = 'admin' | 'verify' | 'api';

export interface CorsOptions {
  origin: string[] | false;
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'x-tenant',
  'x-nonce',
  // If-Match: E10's product-page draft save uses it for optimistic
  // concurrency; without it in the preflight allowlist, browsers block the
  // request entirely (CORS preflight failure, not a 4xx from the API).
  'If-Match',
];

/**
 * Build CORS options for a given app.
 *
 * Origins are read from env:
 * - CORS_ORIGINS_ADMIN  → comma-separated origins for the admin app
 * - CORS_ORIGINS_VERIFY → comma-separated origins for the verify app
 *
 * The API uses the union of both.
 */
export function corsAllowlist(
  app: CorsApp,
  env: Record<string, string | undefined>,
): CorsOptions {
  let origins: string[] = [];

  switch (app) {
    case 'admin': {
      const raw = env.CORS_ORIGINS_ADMIN ?? '';
      origins = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    }
    case 'verify': {
      const raw = env.CORS_ORIGINS_VERIFY ?? '';
      origins = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    }
    case 'api': {
      const admin = (env.CORS_ORIGINS_ADMIN ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const verify = (env.CORS_ORIGINS_VERIFY ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      origins = [...new Set([...admin, ...verify])];
      break;
    }
  }

  return {
    origin: origins.length > 0 ? origins : false,
    methods: DEFAULT_METHODS,
    allowedHeaders: DEFAULT_HEADERS,
    credentials: true,
  };
}
