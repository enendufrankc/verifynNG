import { z } from 'zod';

// ── E00 Foundation ──────────────────────────────────────────────
const e00Schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      'postgresql://postgres:postgres@localhost:5432/verifynng?schema=public',
    ),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(4000),
  // MinIO / S3
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  // Browser-reachable MinIO URL for presigned PUT/GET links — the api
  // container talks to `minio:9000` over the compose network, but a
  // browser on the host can't resolve that hostname.
  S3_PUBLIC_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('verifynng'),
  // SMTP (Mailpit)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  // Next.js
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  // ── E03: tenant lifecycle ───────────────────────────────────
  OFFBOARDING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  // Runs the tenant-offboarding BullMQ worker in the api process until
  // E04's api-worker service exists.
  WORKER_INLINE: z.coerce.boolean().default(true),
});

// ── E02 Identity & Access ──────────────────────────────────────
const e02Schema = e00Schema.extend({
  JWT_KEYS: z
    .string()
    .default(
      'k1:0000000000000000000000000000000000000000000000000000000000000000',
    ),
  JWT_ACTIVE_KID: z.string().default('k1'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),
  MFA_ENC_KEY: z
    .string()
    .default(
      '0000000000000000000000000000000000000000000000000000000000000000',
    ), // 64 hex chars = 32 bytes (aes-256-gcm key)
  ARGON2_M_COST: z.coerce.number().default(65536), // 64 MiB
  ARGON2_T_COST: z.coerce.number().default(3),
  ARGON2_P_COST: z.coerce.number().default(4),
  WORKER_KEY: z.string().default(''),
  FAKE_SMS_KEY: z.string().default(''),
  FAKE_PAY_KEY: z.string().default(''),
  FAKE_GEO_KEY: z.string().default(''),
  APP_BASE_URL: z.string().default('http://localhost:3001'),
});

// ── E04 Catalog & Minting ────────────────────────────────────────
// CORE_KEYS/CORE_ACTIVE_KID live here (not duplicated in E06 below): E01's
// key ring is shared by whoever mints (E04) and whoever verifies (E06), so
// there must be exactly one definition and one default value for both.
const e04Schema = z.object({
  CORE_KEYS: z
    .string()
    .default(
      'k1:0000000000000000000000000000000000000000000000000000000000000000',
    ),
  CORE_ACTIVE_KID: z.string().default('k1'),
  MINT_SYNC_MAX: z.coerce.number().default(5000),
  MINT_CHUNK: z.coerce.number().default(1000),
  MINT_MAX_COUNT: z.coerce.number().default(1000000),
  MANIFEST_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .default(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ),
  VERIFY_BASE_URL: z.string().default('http://localhost:3000'),
  WORKER: z.enum(['true', 'false']).default('false'),
  WORKER_INLINE: z.enum(['true', 'false']).default('true'),
});

// ── E06 Verification & Scan Events ──────────────────────────────
const e06Schema = z.object({
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().default(20),
  RATE_LIMIT_CODE_PER_MIN: z.coerce.number().default(10),
  RATE_LIMIT_TENANT_DEFAULT_PER_MIN: z.coerce.number().default(600),
  ENUMERATION_INVALID_THRESHOLD: z.coerce.number().default(15),
  ENUMERATION_WINDOW_SEC: z.coerce.number().default(300),
  ENUMERATION_BLOCK_SEC: z.coerce.number().default(900),
  IP_HASH_SALT: z.string().default('verifynng-ip-salt-dev'),
  GEOIP_PROVIDER: z.enum(['fake', 'maxmind']).default('fake'),
  GEOIP_URL: z.string().default('http://fake-geo:4103'),
  GEOIP_MMDB_PATH: z.string().default(''),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SMS_PROVIDER: z.enum(['fake', 'termii']).default('fake'),
  SMS_URL: z.string().default('http://fake-sms:4101'),
  // FAKE_SMS_KEY is defined once, in e02Schema above — E02's InternalOnlyGuard
  // and E06's VerifySmsController both read that single value.
});

// ── E13 Audit & Security ────────────────────────────────────────
const e13Schema = z.object({
  // Core keys for HMAC signing (JSON format preferred)
  CORE_KEYS_JSON: z
    .string()
    .default(
      '{"active":"k1","keys":{"k1":"0000000000000000000000000000000000000000000000000000000000000000"}}',
    ),
  // CORE_KEYS / CORE_ACTIVE_KID (legacy E01 format) are defined in e06Schema.
  // CORS
  CORS_ORIGINS_ADMIN: z.string().default('http://localhost:3001'),
  CORS_ORIGINS_VERIFY: z.string().default('http://localhost:3000'),
  // CSP
  CSP_REPORT_ONLY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Secrets file
  SECRETS_FILE: z.string().default('docker/secrets/local.env'),
  // Real deployments set DEPLOYMENT_ENV=production; NODE_ENV=production alone is
  // also what local Docker images run with, so it cannot be the trigger.
  DEPLOYMENT_ENV: z.enum(['local', 'staging', 'production']).default('local'),
});

// ── E17 Observability ───────────────────────────────────────────
const e17Schema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4317'),
  OTEL_TRACES_SAMPLER: z.string().default('always_on'),
  OTEL_TRACES_SAMPLER_ARG: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('api'),
  OTEL_EXPORTER_OTLP_PROTOCOL: z.string().default('grpc'),
  PROBE_KEY: z.string().default('probe-secret-local'),
  PROBE_FIXTURE_CODE: z.string().default('PROBE_TIER1_OK'),
  SENTRY_DSN: z.string().optional(),
  OPS_ALERT_EMAILS: z.string().default('ops@verifynng.local'),
  ALERT_WEBHOOK_SECRET: z.string().default('alert-webhook-secret-local'),
  GRAFANA_PORT: z.coerce.number().default(3100),
  LOKI_PORT: z.coerce.number().default(3101),
  TEMPO_PORT: z.coerce.number().default(3102),
  PROMETHEUS_PORT: z.coerce.number().default(3103),
  OTEL_COLLECTOR_PORT: z.coerce.number().default(3104),
  UPTIME_PROBE_PORT: z.coerce.number().default(3105),
  METRICS_PORT: z.coerce.number().default(9464),
  LOKI_URL: z.string().default('http://loki:3100'),
  VERIFY_ARTIFICIAL_DELAY_MS: z.coerce.number().default(0),
});

// ── E14 Notifications ──────────────────────────────────────────
const e14Schema = z.object({
  MAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  RESEND_API_KEY: z.string().default(''),
  SMS_PROVIDER: z.enum(['fake', 'termii']).default('fake'),
  TERMII_API_KEY: z.string().default(''),
  TERMII_SENDER: z.string().default('VerifyN'),
  FAKE_SMS_URL: z.string().default('http://localhost:4101'),
  WHATSAPP_PROVIDER: z.enum(['fake', 'meta']).default('fake'),
  META_WA_PHONE_NUMBER_ID: z.string().default(''),
  META_WA_ACCESS_TOKEN: z.string().default(''),
  META_WA_BUSINESS_ACCOUNT_ID: z.string().default(''),
  NOTIFICATIONS_FROM: z.string().default('VerifyN <noreply@verifyn.ng>'),
  FAKE_WEBHOOK_SECRET: z.string().default('dev-secret'),
});

// ── E08 Consumer Fake Reporting ─────────────────────────────────
const e08Schema = z.object({
  CAPTCHA_PROVIDER: z.enum(['fake', 'turnstile']).default('fake'),
  TURNSTILE_SECRET: z.string().default(''),
  FAKE_CAPTCHA_URL: z.string().default('http://fake-captcha:4106'),
  REPORT_PHOTO_MAX_BYTES: z.coerce.number().default(8_000_000),
  REPORTS_MAX_PHOTOS: z.coerce.number().default(5),
  REPORT_INCOMING_TTL_HOURS: z.coerce.number().default(24),
  REPORTS_BUCKET_INCOMING: z.string().default('reports-incoming'),
  REPORTS_BUCKET: z.string().default('reports'),
  REPORT_MAX_INPUT_PIXELS: z.coerce.number().default(40_000_000),
});

// ─── E05 OEM Manifest Delivery ──────────────────────────────────
const e05Schema = z.object({
  OEM_PORTAL_BASE_URL: z.string().default('http://localhost:3001'),
  DELIVERY_DEFAULT_EXPIRY_HOURS: z.coerce.number().default(72),
  DELIVERY_DEFAULT_MAX_DOWNLOADS: z.coerce.number().default(5),
});

// ── E09 Consumer Verify Web ─────────────────────────────────────
const e09Schema = z.object({
  NEXT_PUBLIC_MINIO_PUBLIC_URL: z.string().default('http://localhost:9000'),
  NEXT_PUBLIC_DEFAULT_TENANT: z.string().default('ivoryglow'),
  VERIFY_API_TIMEOUT_MS: z.coerce.number().default(3000),
});

// ── E12 Analytics & Metering ────────────────────────────────────
const e12Schema = z.object({
  // Incremental scan rollup job — every 10 min per the epic's lag budget.
  ANALYTICS_ROLLUP_CRON: z.string().default('*/10 * * * *'),
  // Nightly reconcile of the last 3 days (drift/late-event correction).
  ANALYTICS_RECONCILE_CRON: z.string().default('30 2 * * *'),
  // Monthly UsageSummary finalise — day 1, 02:00 UTC, for the previous month.
  METERING_MONTH_CLOSE_CRON: z.string().default('0 2 1 * *'),
  // Hint for E19's retention policy, not enforced by E12 itself.
  ANALYTICS_RETENTION_HINT_DAYS: z.coerce.number().default(730),
});

// ── E19 Compliance & Data Governance ─────────────────────────────
const e19Schema = z.object({
  CONSENT_SALT: z.string().default('dev-consent-salt'),
  DSAR_EXPORT_TTL_HOURS: z.coerce.number().default(24),
  RETENTION_CRON: z.string().default('0 2 * * *'),
  RETENTION_DRY_RUN_DEFAULT: z.coerce.boolean().default(false),
  DSAR_EXPORT_BUCKET: z.string().default('dsar-exports'),
});

// ── E07 Anomaly Detection & Unit Lifecycle ──────────────────────
const e07Schema = z.object({
  ANOMALY_SWEEP_CRON: z.string().default('*/15 * * * *'),
  ANOMALY_ALERT_DEBOUNCE_MIN: z.coerce.number().default(60),
});

// ── E10 Product Pages & Page Builder ─────────────────────────────
const e10Schema = z.object({
  PAGE_REVALIDATE_SECRET: z.string().default('dev-page-revalidate-secret'),
  // Browser-facing web-verify origin — used by web-verify itself to build
  // canonical URLs, sitemap <loc> entries and JSON-LD. Never used for
  // server-to-server calls (see WEB_VERIFY_INTERNAL_URL below) — `localhost`
  // inside a container never reaches another container.
  PAGES_PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  // Container-internal web-verify address — what apps/api's PageRevalidator
  // calls for POST /p/revalidate. Same split as API_INTERNAL_URL/
  // NEXT_PUBLIC_API_URL elsewhere in this app.
  WEB_VERIFY_INTERNAL_URL: z.string().default('http://web-verify:3000'),
  PLATFORM_HOSTS: z.string().default('localhost:3000'),
  // Compose-only stub for host→tenant domain lookup readiness, e.g.
  // "ivoryglow.localhost:3000:ivoryglow" — no DNS/TLS involved.
  PAGE_DOMAIN_STUB: z.string().default(''),
  PAGES_MEDIA_BUCKET: z.string().default('pages'),
  PAGES_MAX_UPLOAD_MB: z.coerce.number().default(10),
});

// ── E16 Public API & Webhooks ────────────────────────────────────
const e16Schema = z.object({
  PUBLIC_API_DEFAULT_RPM: z.coerce.number().default(120),
  PUBLIC_API_MAX_KEYS_DEFAULT: z.coerce.number().default(10),
  // dev/compose only — must stay false in any real deployment.
  WEBHOOKS_ALLOW_HTTP: z.coerce.boolean().default(false),
  WEBHOOKS_ALLOW_PRIVATE: z.coerce.boolean().default(false),
  WEBHOOKS_BACKOFF_BASE_MS: z.coerce.number().default(30000),
  WEBHOOKS_MAX_ATTEMPTS: z.coerce.number().default(10),
  WEBHOOK_SINK_URL: z.string().default('http://webhook-sink:4105'),
  // AES-256-GCM key encrypting WebhookEndpoint.secretEnc at rest — same
  // [iv(12)|tag(16)|ciphertext] layout as E04's MANIFEST_ENC_KEY, own
  // dedicated key rather than reusing another epic's.
  WEBHOOK_SECRET_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .default('fedcba9876543210'.repeat(4)),
});

// ── E20 SSO & MFA Policy ─────────────────────────────────────────
const e20Schema = z.object({
  // No `v1/` prefix — see the routing-convention note in E20-sso.md's T1
  // checklist entry (this codebase doesn't actually use one).
  SSO_CALLBACK_URL: z
    .string()
    .default('http://localhost:4000/auth/sso/callback'),
  SSO_STATE_TTL_SECONDS: z.coerce.number().default(600),
  SSO_DISCOVERY_TIMEOUT_MS: z.coerce.number().default(5000),
  // `api` reaches the fake IdP over the compose network; a browser on the
  // host redirected to it needs the host-published URL instead — same
  // internal/public split as S3_ENDPOINT/S3_PUBLIC_ENDPOINT above.
  FAKE_OIDC_ISSUER: z.string().default('http://fake-oidc:4104/default'),
  FAKE_OIDC_PUBLIC_ISSUER: z.string().default('http://localhost:4104/default'),
  SSO_CLIENT_SECRET_ENC_KEY: z
    .string()
    .default(
      '0000000000000000000000000000000000000000000000000000000000000000',
    ), // 64 hex chars = 32 bytes (aes-256-gcm key)
});

const ZERO_KEY = '0'.repeat(64);

export const envSchema = e02Schema
  .merge(e06Schema)
  .merge(e17Schema)
  .merge(e14Schema)
  .merge(e13Schema)
  .merge(e04Schema)
  .merge(e08Schema)
  .merge(e05Schema)
  .merge(e09Schema)
  .merge(e12Schema)
  .merge(e19Schema)
  .merge(e07Schema)
  .merge(e10Schema)
  .merge(e16Schema)
  .merge(e20Schema)
  .superRefine((env, ctx) => {
    if (env.DEPLOYMENT_ENV !== 'production') return;
    // Fail fast in real deployments: dev defaults must never reach production.
    if (env.JWT_KEYS.includes(ZERO_KEY))
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_KEYS'],
        message: 'dev default key not allowed in production',
      });
    if (env.MFA_ENC_KEY === ZERO_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['MFA_ENC_KEY'],
        message: 'dev default key not allowed in production',
      });
    if (env.SSO_CLIENT_SECRET_ENC_KEY === ZERO_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['SSO_CLIENT_SECRET_ENC_KEY'],
        message: 'dev default key not allowed in production',
      });
    if (
      env.CORE_KEYS_JSON.includes(ZERO_KEY) ||
      env.CORE_KEYS.includes(ZERO_KEY)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['CORE_KEYS_JSON'],
        message: 'dev default core key not allowed in production',
      });
    if (env.CSP_REPORT_ONLY)
      ctx.addIssue({
        code: 'custom',
        path: ['CSP_REPORT_ONLY'],
        message: 'CSP must be enforced (CSP_REPORT_ONLY=false) in production',
      });
  });

export type Env = z.infer<typeof envSchema>;
