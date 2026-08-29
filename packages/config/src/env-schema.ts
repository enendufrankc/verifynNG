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
  MFA_ENC_KEY: z.string().default('00000000000000000000000000000000'), // 32 hex chars = 16 bytes
  ARGON2_M_COST: z.coerce.number().default(65536), // 64 MiB
  ARGON2_T_COST: z.coerce.number().default(3),
  ARGON2_P_COST: z.coerce.number().default(4),
  INTERNAL_API_KEYS: z.string().default(''),
  APP_BASE_URL: z.string().default('http://localhost:3001'),
});

// ── Sections for other epics will be added here ────────────────
// E14 will add EMAIL_FROM, etc.

export const envSchema = e02Schema;

export type Env = z.infer<typeof envSchema>;
