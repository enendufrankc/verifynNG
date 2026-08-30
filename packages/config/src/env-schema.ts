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

// ── Sections for other epics will be added here ────────────────
// E14 will add EMAIL_FROM, etc.

export const envSchema = e02Schema.merge(e04Schema).merge(e06Schema);

export type Env = z.infer<typeof envSchema>;
