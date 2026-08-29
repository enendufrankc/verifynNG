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

export const envSchema = e00Schema.merge(e17Schema);

export type Env = z.infer<typeof envSchema>;
