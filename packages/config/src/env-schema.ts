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

// ── Sections for other epics will be added here ────────────────
// E02 will add JWT_SECRET, etc.
// E14 will add EMAIL_FROM, etc.

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
  FAKE_SMS_KEY: z.string().default('fake-sms-key'),
  CORE_KEYS: z.string().default(
    'k1:0000000000000000000000000000000000000000000000000000000000000000',
  ),
  CORE_ACTIVE_KID: z.string().default('k1'),
});

export const envSchema = e00Schema.merge(e06Schema);

export type Env = z.infer<typeof envSchema>;
