import 'server-only';
import { z } from 'zod';
import { loadEnv } from '@verifynng/config';
import { VERDICTS, SEVERITIES } from './verdict';
import { redactCode } from './redact';

/**
 * Server-to-server calls use the container-internal API address
 * (`API_INTERNAL_URL`, e.g. `http://api:4000`), never the browser-facing
 * `NEXT_PUBLIC_API_URL` — that one gets inlined into the client bundle at
 * build time (for lib/beacon.ts) and would be wrong for same-network
 * container calls. Same split as apps/web-admin's Route Handlers.
 */
function apiInternalUrl(): string {
  return process.env.API_INTERNAL_URL || loadEnv().NEXT_PUBLIC_API_URL;
}

// ---------------------------------------------------------------------------
// GET /v1/verify/:code — E06
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  logoUrl: z.string().optional(),
});

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string(),
  gtin: z.string().optional(),
});

const batchSchema = z.object({
  id: z.string(),
  oem: z.string().optional(),
  commissionedAt: z.string(),
});

const historySchema = z.object({
  firstVerifiedAt: z.string().nullable(),
  scanCount: z.number(),
  distinctRegions: z.array(z.string()),
  lastVerifiedAt: z.string().nullable(),
});

const signalsSchema = z.object({
  first: z.boolean(),
  multiRegion: z.boolean(),
  highCount: z.boolean(),
  flagged: z.boolean(),
});

export const verifyResponseSchema = z.object({
  verdict: z.enum(VERDICTS),
  severity: z.enum(SEVERITIES),
  tier: z.union([z.literal(1), z.literal(2)]).optional(),
  code: z.string(),
  brand: brandSchema.optional(),
  product: productSchema.optional(),
  batch: batchSchema.optional(),
  message: z.string(),
  history: historySchema.optional(),
  signals: signalsSchema.optional(),
  retryAfterSec: z.number().optional(),
  reportable: z.boolean(),
  scanEventId: z.string().optional(),
});

export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

export type VerifyResult =
  | { ok: true; data: VerifyResponse }
  | {
      ok: false;
      reason: 'timeout' | 'network' | 'http-error' | 'bad-response';
    };

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls E06's `GET /v1/verify/:code` exactly once per invocation (retried
 * only on a network/timeout failure, never on a 4xx — a 429 still carries a
 * valid rate-limited verdict body and is handled as success). `code` should
 * already be normalized. Forwards the consumer's real IP/UA so E06 records
 * those, not the Next server's.
 */
export async function verifyCode(
  code: string,
  opts: {
    ip: string | null;
    userAgent: string | null;
    src?: 'qr' | 'manual' | 'sms';
  },
): Promise<VerifyResult> {
  const env = loadEnv();
  const url = new URL(
    `/v1/verify/${encodeURIComponent(code)}`,
    apiInternalUrl(),
  );
  if (opts.src) url.searchParams.set('src', opts.src);

  const headers: Record<string, string> = {};
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  if (opts.userAgent) headers['user-agent'] = opts.userAgent;

  const attempt = () =>
    fetchWithTimeout(
      url.toString(),
      { headers, cache: 'no-store' },
      env.VERIFY_API_TIMEOUT_MS,
    );

  let res: Response;
  try {
    res = await attempt();
  } catch (firstErr) {
    try {
      res = await attempt();
    } catch {
      const timedOut =
        firstErr instanceof DOMException && firstErr.name === 'AbortError';
      return { ok: false, reason: timedOut ? 'timeout' : 'network' };
    }
  }

  if (res.status >= 500) {
    return { ok: false, reason: 'http-error' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    if (res.status === 429) return rateLimitedFromHeaders(code, res);
    return { ok: false, reason: 'bad-response' };
  }

  const parsed = verifyResponseSchema.safeParse(json);
  if (parsed.success) return { ok: true, data: parsed.data };
  if (res.status === 429) return rateLimitedFromHeaders(code, res);
  return { ok: false, reason: 'bad-response' };
}

/**
 * A platform-wide `@Catch()` filter in apps/api currently rewrites every
 * HttpException response (429 included) into a generic
 * `{statusCode, timestamp, message}` envelope, discarding the
 * `VerifyResponseDto` body E06's controller constructs for a rate limit
 * (confirmed against a live `docker compose up` stack — see the change
 * request added to CROSS-EPIC-REQUESTS.md under "To E17"). AC3 requires
 * the amber "too many checks" card here, never a false "could not check"
 * error, so this reconstructs a minimal rate-limited verdict from the
 * `Retry-After` header when the body isn't E06's real shape — and still
 * prefers the real body above once the filter is fixed upstream.
 */
function rateLimitedFromHeaders(code: string, res: Response): VerifyResult {
  const retryAfterHeader = res.headers.get('retry-after');
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  return {
    ok: true,
    data: {
      verdict: 'rate-limited',
      severity: 'grey',
      code: redactCode(code),
      message: 'Too many verification attempts. Please try again later.',
      reportable: false,
      ...(retryAfterSec !== undefined && !Number.isNaN(retryAfterSec)
        ? { retryAfterSec }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /v1/tenants/:slug/public-profile — E03 (change request, not shipped yet)
// ---------------------------------------------------------------------------

const paletteSchema = z.object({
  primary: z.string(),
  accent: z.string(),
  bg: z.string(),
  ink: z.string(),
});

const publicProfileSchema = z.object({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().optional(),
  palette: paletteSchema,
  fontDisplay: z.string().optional(),
  fontBody: z.string().optional(),
  trademarkLine: z.string().optional(),
  supportUrl: z.string().optional(),
  socials: z.record(z.string()).optional(),
});

export type TenantPublicProfile = z.infer<typeof publicProfileSchema>;

const IVORY_GLOW_DEFAULT: TenantPublicProfile = {
  slug: 'ivoryglow',
  name: 'IVORY GLOW',
  palette: {
    primary: '#5AE9D7',
    accent: '#1CCFB8',
    bg: '#D9DCEF',
    ink: '#131720',
  },
  trademarkLine:
    'IVORY GLOW is a registered trademark of Tunnel Light Global Concept Ltd.',
};

function defaultProfileFor(slug: string): TenantPublicProfile {
  if (slug === IVORY_GLOW_DEFAULT.slug) return IVORY_GLOW_DEFAULT;
  return { ...IVORY_GLOW_DEFAULT, slug, name: slug };
}

/**
 * Stub until E03 ships `GET /v1/tenants/:slug/public-profile` (see
 * CROSS-EPIC-REQUESTS.md → "To E03"). Any non-2xx or unparseable response
 * falls back to the IVORY GLOW defaults rather than blocking the page —
 * tenant branding must never prevent a verdict from rendering.
 */
export async function getTenantPublicProfile(
  slug: string,
): Promise<TenantPublicProfile> {
  const env = loadEnv();
  const url = new URL(
    `/v1/tenants/${encodeURIComponent(slug)}/public-profile`,
    apiInternalUrl(),
  );
  try {
    const res = await fetchWithTimeout(
      url.toString(),
      { next: { revalidate: 300 } },
      env.VERIFY_API_TIMEOUT_MS,
    );
    if (!res.ok) return defaultProfileFor(slug);
    const json: unknown = await res.json();
    const parsed = publicProfileSchema.safeParse(json);
    if (!parsed.success) return defaultProfileFor(slug);
    return parsed.data;
  } catch {
    return defaultProfileFor(slug);
  }
}
