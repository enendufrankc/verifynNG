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
  CORE_KEYS: z
    .string()
    .default(
      'k1:0000000000000000000000000000000000000000000000000000000000000000',
    ),
  CORE_ACTIVE_KID: z.string().default('k1'),
});

// ── Sections for other epics will be added here ────────────────
// E14 will add EMAIL_FROM, etc.


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

export const envSchema = e02Schema
  .merge(e06Schema)
  .merge(e17Schema)
  .merge(e14Schema);

export type Env = z.infer<typeof envSchema>;
