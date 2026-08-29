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
  S3_ENDPOINT: z.string().default('http://minio:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('verifyng'),
  // SMTP (Mailpit)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  // Next.js
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  OFFBOARDING_GRACE_DAYS: z.coerce.number().int().nonnegative().default(30),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  JWT_SECRET: z.string().default('development-only-secret-change-me'),
});

// ── Sections for other epics will be added here ────────────────
// E02 will add JWT_SECRET, etc.
// E14 will add EMAIL_FROM, etc.

export const envSchema = e00Schema;

export type Env = z.infer<typeof envSchema>;
