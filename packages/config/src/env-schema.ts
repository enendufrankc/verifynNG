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

// ── E14 Notifications ──────────────────────────────────────────
const e14Schema = e00Schema.extend({
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

// ── Sections for other epics will be added here ────────────────
// E02 will add JWT_SECRET, etc.

export const envSchema = e14Schema;

export type Env = z.infer<typeof e14Schema>;
