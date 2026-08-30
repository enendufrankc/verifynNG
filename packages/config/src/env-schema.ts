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
  // Used only when presigning download URLs: in compose, S3_ENDPOINT is the
  // container-internal hostname (`minio:9000`), which the SDK needs for its
  // own put/get calls but which an external client (a browser, curl on the
  // host) can never resolve. Presigned URLs must carry a host the caller can
  // actually reach, so getSignedUrl() signs against this endpoint instead.
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
});

// ── E04 Catalog & Minting ──────────────────────────────────────
const e04Schema = e00Schema.extend({
  CORE_KEYS: z
    .string()
    .default(
      'k1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
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

// ── Sections for other epics will be added here ────────────────
// E14 will add EMAIL_FROM, etc.

export const envSchema = e04Schema;

export type Env = z.infer<typeof e04Schema>;
