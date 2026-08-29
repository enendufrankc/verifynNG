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

// ── E13 Audit & Security ────────────────────────────────────────
const e13Schema = z.object({
  // Core keys for HMAC signing (JSON format preferred)
  CORE_KEYS_JSON: z.string().default(
    '{"active":"k1","keys":{"k1":"0000000000000000000000000000000000000000000000000000000000000000"}}',
  ),
  // Legacy format fallback (E01 style)
  CORE_KEYS: z.string().optional(),
  CORE_ACTIVE_KID: z.string().optional(),
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
  // Redis (already in E00 but ensuring it's there)
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
});

// ── Sections for other epics will be added here ────────────────
// E02 will add JWT_SECRET, etc.
// E14 will add EMAIL_FROM, etc.

export const envSchema = e00Schema.merge(e13Schema);

export type Env = z.infer<typeof envSchema>;
