import {
  Controller,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString } from 'class-validator';
import crypto from 'node:crypto';

import {
  verifyChecksum,
  hashForStorage,
  redactCode,
  StaticKeyRing,
} from '@verifynng/core';
import { PrismaClient } from '@prisma/client';

import {
  VerdictEngine,
  VerdictContext,
  VerdictResult,
} from '../verify/verdict-engine';
import { ScanEventsService } from '../scan-events/scan-events.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { EnumerationDetector } from '../rate-limit/enumeration-detector';
import { InternalOnly } from '../auth/decorators/internal-only.decorator';
import type { SmsPort } from './sms.port';
import { SMS_PORT } from './sms.port';

class SmsWebhookBody {
  @ApiProperty({ description: 'Sender phone number' })
  @IsString()
  from!: string;

  @ApiProperty({ description: 'Receiving short code' })
  @IsString()
  to!: string;

  @ApiProperty({ description: 'Message text containing the code' })
  @IsString()
  text!: string;

  @ApiProperty({ description: 'ID from the SMS provider' })
  @IsString()
  providerMessageId!: string;
}

/**
 * Extract the verification code from an inbound SMS text.
 *
 * Accepts both "VERIFY <code>" and a bare code; tolerant downstream via
 * `normalizeCode`.
 */
function extractCodeFromText(text: string): string {
  const trimmed = text.trim();
  if (/^VERIFY\s+/i.test(trimmed)) {
    return trimmed.replace(/^VERIFY\s+/i, '').trim();
  }
  return trimmed;
}

/**
 * VerifySmsController — inbound SMS verification webhook.
 *
 * `POST /v1/verify/sms` is called by the SMS provider (fake-sms in compose,
 * Termii adapter in E14). It authenticates with a shared bearer key, parses
 * the code out of the message body, runs the same VerdictEngine as the
 * public `GET /v1/verify/:code` route, records a `ScanEvent` with
 * `source='sms'`, and replies to the sender with a short SMS (≤ 160 chars).
 *
 * Differences from the public controller:
 *  - No client IP / GeoIP (SMS has none); geo columns are null.
 *  - Rate limit keyed on the `from` phone number (10/min) instead of IP.
 *  - Returns 202 with `{ verdict }` (the reply is delivered via SmsPort).
 *  - Reply delivery is best-effort: a SmsPort failure is logged but never
 *    fails the 202 — the verdict was already computed and recorded.
 *
 * Marked `@InternalOnly('internal')` — enforced globally by E02's
 * `InternalOnlyGuard`, which validates the `Bearer vk_...` key against
 * `ApiClientService` (the `fake-sms` client is seeded with scope
 * `internal` by `seedInternalClients()`).
 */
@ApiTags('verify')
@Controller('v1/verify')
export class VerifySmsController {
  private readonly logger = new Logger(VerifySmsController.name);
  private readonly keyRing: StaticKeyRing;
  private readonly ipSalt: string;
  private readonly rateLimitCodePerMin: number;
  private readonly rateLimitSmsPerMin = 10;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaClient,
    private readonly verdictEngine: VerdictEngine,
    private readonly scanEvents: ScanEventsService,
    private readonly rateLimit: RateLimitService,
    private readonly enumerationDetector: EnumerationDetector,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.keyRing = new StaticKeyRing(
      configService.get<string>('CORE_KEYS')!,
      configService.get<string>('CORE_ACTIVE_KID')!,
    );
    this.ipSalt = configService.get<string>('IP_HASH_SALT')!;
    this.rateLimitCodePerMin = configService.get<number>(
      'RATE_LIMIT_CODE_PER_MIN',
    )!;
  }

  @Post('sms')
  @InternalOnly('internal')
  @HttpCode(202)
  @ApiOperation({ summary: 'Verify a code received via inbound SMS' })
  @ApiResponse({
    status: 202,
    description: 'Webhook accepted; reply sent via SmsPort',
    schema: {
      type: 'object',
      properties: { verdict: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — bad bearer key' })
  @ApiResponse({ status: 503, description: 'Infrastructure unavailable' })
  async verifySms(
    @Body() body: SmsWebhookBody,
    @Headers() headers: Record<string, string>,
  ): Promise<{ verdict: string }> {
    // Authentication is enforced globally by InternalOnlyGuard (@InternalOnly above).
    const startedAt = Date.now();
    const requestId = headers['x-request-id'] ?? '-';
    const rawCode = extractCodeFromText(body.text);
    const redacted = redactCode(rawCode);
    const logCtx = { requestId, code: redacted, from: body.from };

    const phoneHash = this.hashPhone(body.from);

    try {
      // --- 1. Parse + checksum (no DB / Redis hit) ----------------------
      const checksumResult = verifyChecksum(this.keyRing, rawCode);

      const parsed =
        checksumResult.ok === true
          ? {
              tenant: checksumResult.parsed.tenant,
              tier: checksumResult.parsed.tier,
              kid: checksumResult.parsed.kid,
              payload: checksumResult.parsed.payload,
              checksum: checksumResult.parsed.checksum,
              legacy: checksumResult.parsed.legacy,
            }
          : null;
      const checksumOk = checksumResult.ok;

      // --- 2. Invalid → reply immediately (no DB hit) -------------------
      if (parsed === null || !checksumOk) {
        const result = this.verdictEngine.evaluate({
          parsed,
          checksumOk,
          unit: null,
          tenant: null,
          product: null,
          batch: null,
          priorScans: [],
          redactedCode: redacted,
          brandDisplayName: '',
          brandSlug: '',
          rateLimited: false,
          now: new Date(),
        } satisfies VerdictContext);

        // Observe the invalid scan for enumeration (best-effort).
        try {
          await this.enumerationDetector.observeInvalid(
            phoneHash,
            parsed?.tenant,
          );
        } catch (err) {
          this.logger.error(
            'enumeration observe failed (Redis down?) — returning 503',
            err instanceof Error ? err.stack : String(err),
            logCtx,
          );
          throw new HttpException(
            'Service temporarily unavailable',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        await this.sendReply(body.from, result, parsed?.tenant ?? '');
        return { verdict: result.verdict };
      }

      const tier = parsed.tier;
      const tenantSlug = parsed.tenant;
      // Canonical storage form, reconstructed from the parsed segments
      // (tenant/kid lower-cased) — see verify.controller.ts for why this
      // can't just be `normalizeCode(rawCode)`.
      const canonicalCode = `${parsed.tenant}.${parsed.tier}.${parsed.kid}.${parsed.payload}.${parsed.checksum}`;

      // --- 3. Rate limits (phone replaces IP) ---------------------------
      let rateLimited = false;
      let retryAfterSec: number | undefined;

      try {
        // 3a. Phone hard-block (enumeration)
        const blocked = await this.rateLimit.isBlocked(`ip:${phoneHash}`);
        if (blocked) {
          rateLimited = true;
          retryAfterSec = this.configService.get<number>(
            'ENUMERATION_BLOCK_SEC',
          )!;
        }

        // 3b. Per-phone (10/min)
        if (!rateLimited) {
          const rl = await this.rateLimit.hit(
            `rl:sms:${phoneHash}`,
            this.rateLimitSmsPerMin,
            60,
          );
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // 3c. Tenant lookup (needed for per-tenant limit + verdict)
        let tenant: {
          id: string;
          slug: string;
          status: import('@prisma/client').TenantStatus;
          name: string;
          verifyRateLimitPerMin: number;
        } | null = null;
        try {
          const t = await this.prisma.tenant.findUnique({
            where: { slug: tenantSlug },
          });
          if (t) {
            tenant = {
              id: t.id,
              slug: t.slug,
              status: t.status,
              name: t.name,
              verifyRateLimitPerMin: t.verifyRateLimitPerMin,
            };
          }
        } catch (err) {
          this.logger.error(
            'tenant lookup failed (Postgres down?) — returning 503',
            err instanceof Error ? err.stack : String(err),
            { ...logCtx, tenantSlug },
          );
          throw new HttpException(
            'Service temporarily unavailable',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        // 3d. Per-tenant
        if (!rateLimited && tenant) {
          const rl = await this.rateLimit.hit(
            `rl:tenant:${tenant.id}`,
            tenant.verifyRateLimitPerMin,
            60,
          );
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // 3e. Per-code (tier 2 only)
        if (!rateLimited && tier === 2) {
          const tier2Hash = hashForStorage(canonicalCode);
          const rl = await this.rateLimit.hit(
            `rl:code:${tier2Hash}`,
            this.rateLimitCodePerMin,
            60,
          );
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // --- 4. Offboarded tenant → unknown (no unit lookup) ----------
        if (tenant?.status === 'offboarded') {
          const result = this.verdictEngine.evaluate({
            parsed,
            checksumOk,
            unit: null,
            tenant,
            product: null,
            batch: null,
            priorScans: [],
            redactedCode: redacted,
            brandDisplayName: tenant.name,
            brandSlug: tenant.slug,
            rateLimited,
            retryAfterSec,
            now: new Date(),
          } satisfies VerdictContext);

          const scanEvent = await this.recordScan({
            tenantId: tenant.id,
            unitId: null,
            tier,
            verdict: result.verdict,
            redactedCode: redacted,
            latencyMs: Date.now() - startedAt,
          });

          this.emitScanRecorded({
            scanEventId: scanEvent.id,
            tenantId: tenant.id,
            unitId: null,
            batchId: null,
            tier,
            verdict: result.verdict,
            phoneHash,
            src: 'sms',
            at: scanEvent.createdAt,
          });

          await this.sendReply(body.from, result, tenant.slug);
          return { verdict: result.verdict };
        }

        // --- 5. Unit lookup (tier-gated) ------------------------------
        let unit: {
          id: string;
          state: 'active' | 'flagged' | 'decommissioned';
          tenantId: string;
          batchId: string;
        } | null = null;
        let product: {
          id: string;
          name: string;
          sku: string;
          gtin?: string;
        } | null = null;
        let batch: {
          id: string;
          oem?: string;
          commissionedAt: string;
        } | null = null;

        try {
          if (tier === 1) {
            const row = await this.prisma.unit.findUnique({
              where: { tier1Code: canonicalCode },
              include: { batch: { include: { product: true, oem: true } } },
            });
            if (row) {
              unit = {
                id: row.id,
                state: row.state,
                tenantId: row.tenantId,
                batchId: row.batchId,
              };
              product = row.batch.product
                ? {
                    id: row.batch.product.id,
                    name: row.batch.product.name,
                    sku: row.batch.product.sku,
                    gtin: row.batch.product.gtin ?? undefined,
                  }
                : null;
              batch = {
                id: row.batch.id,
                oem: row.batch.oem?.name ?? undefined,
                commissionedAt: row.batch.createdAt.toISOString(),
              };
            }
          } else {
            const tier2Hash = hashForStorage(canonicalCode);
            const row = await this.prisma.unit.findUnique({
              where: { tier2Hash },
              include: { batch: { include: { product: true, oem: true } } },
            });
            if (row) {
              unit = {
                id: row.id,
                state: row.state,
                tenantId: row.tenantId,
                batchId: row.batchId,
              };
              product = row.batch.product
                ? {
                    id: row.batch.product.id,
                    name: row.batch.product.name,
                    sku: row.batch.product.sku,
                    gtin: row.batch.product.gtin ?? undefined,
                  }
                : null;
              batch = {
                id: row.batch.id,
                oem: row.batch.oem?.name ?? undefined,
                commissionedAt: row.batch.createdAt.toISOString(),
              };
            }
          }
        } catch (err) {
          this.logger.error(
            'unit lookup failed (Postgres down?) — returning 503',
            err instanceof Error ? err.stack : String(err),
            { ...logCtx, tenantId: tenant?.id },
          );
          throw new HttpException(
            'Service temporarily unavailable',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        // --- 6. Prior tier-2 scans (for history / signals) ----------
        let priorScans: Array<{
          geoCity: string | null;
          geoCountry: string | null;
          createdAt: Date;
        }> = [];
        if (tier === 2 && unit) {
          try {
            const events = await this.scanEvents.forUnit(unit.id, 'tier2', {
              limit: 100,
            });
            priorScans = events.map((e) => ({
              geoCity: e.geoCity,
              geoCountry: e.geoCountry,
              createdAt: e.createdAt,
            }));
          } catch (err) {
            this.logger.error(
              'prior scan lookup failed (Postgres down?) — returning 503',
              err instanceof Error ? err.stack : String(err),
              { ...logCtx, tenantId: tenant?.id, unitId: unit.id },
            );
            throw new HttpException(
              'Service temporarily unavailable',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
        }

        // --- 7. Evaluate verdict -------------------------------------
        const result = this.verdictEngine.evaluate({
          parsed,
          checksumOk,
          unit,
          tenant,
          product,
          batch,
          priorScans,
          redactedCode: redacted,
          brandDisplayName: tenant?.name ?? '',
          brandSlug: tenant?.slug ?? tenantSlug,
          rateLimited,
          retryAfterSec,
          now: new Date(),
        } satisfies VerdictContext);

        // --- 8. Record scan event -----------------------------------
        const tenantIdForRecord = tenant?.id ?? unit?.tenantId ?? '';
        let scanEventId: string | null = null;

        if (tenantIdForRecord) {
          try {
            const scanEvent = await this.recordScan({
              tenantId: tenantIdForRecord,
              unitId: unit?.id ?? null,
              tier,
              verdict: result.verdict,
              redactedCode: redacted,
              latencyMs: Date.now() - startedAt,
            });
            scanEventId = scanEvent.id;

            // --- 9. Emit scan.recorded -----------------------------
            this.emitScanRecorded({
              scanEventId: scanEvent.id,
              tenantId: tenantIdForRecord,
              unitId: unit?.id ?? null,
              batchId: unit?.batchId ?? null,
              tier,
              verdict: result.verdict,
              phoneHash,
              src: 'sms',
              at: scanEvent.createdAt,
            });
          } catch (err) {
            this.logger.error(
              'scan event recording failed — returning 503',
              err instanceof Error ? err.stack : String(err),
              { ...logCtx, tenantId: tenantIdForRecord },
            );
            throw new HttpException(
              'Service temporarily unavailable',
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
        }

        // --- 10. Observe invalid for enumeration (tier-2 unknown) ---
        if (result.verdict === 'unknown' && phoneHash) {
          try {
            await this.enumerationDetector.observeInvalid(
              phoneHash,
              tenantSlug,
            );
          } catch (err) {
            this.logger.warn(
              `enumeration observe failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
              logCtx,
            );
          }
        }

        // --- 11. Reply + return ------------------------------------
        await this.sendReply(body.from, result, tenant?.slug ?? tenantSlug);
        this.logger.debug(
          `sms verdict=${result.verdict} scanEventId=${scanEventId ?? '-'}`,
          logCtx,
        );
        return { verdict: result.verdict };
      } catch (err) {
        if (err instanceof HttpException) throw err;
        // Rate-limit / Redis layer blew up — never a false verdict.
        this.logger.error(
          'rate-limit layer failed (Redis down?) — returning 503',
          err instanceof Error ? err.stack : String(err),
          logCtx,
        );
        throw new HttpException(
          'Service temporarily unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'unexpected error during SMS verification — returning 503',
        err instanceof Error ? err.stack : String(err),
        logCtx,
      );
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** sha256(IP_HASH_SALT || phone) — the SMS equivalent of `hashIp`. */
  private hashPhone(phone: string): string {
    return crypto
      .createHash('sha256')
      .update(this.ipSalt + phone)
      .digest('hex');
  }

  private async recordScan(args: {
    tenantId: string;
    unitId: string | null;
    tier: 1 | 2;
    verdict: string;
    redactedCode: string;
    latencyMs: number;
  }) {
    return this.scanEvents.record({
      tenantId: args.tenantId,
      unitId: args.unitId,
      tier: args.tier === 1 ? 'tier1' : 'tier2',
      verdict: args.verdict,
      source: 'sms',
      code: args.redactedCode,
      redactedCode: args.redactedCode,
      ip: null,
      userAgent: null,
      batchId: null,
      productId: null,
      geoCountry: null,
      geoCity: null,
      latencyMs: args.latencyMs,
    });
  }

  private emitScanRecorded(payload: {
    scanEventId: string;
    tenantId: string;
    unitId: string | null;
    batchId: string | null;
    tier: 1 | 2;
    verdict: string;
    phoneHash: string;
    src: string;
    at: Date;
  }) {
    // The domain event contract uses `ipHash`; for SMS the sender phone hash
    // occupies that slot (no client IP exists).
    this.eventEmitter.emit('scan.recorded', {
      scanEventId: payload.scanEventId,
      tenantId: payload.tenantId,
      unitId: payload.unitId,
      batchId: payload.batchId,
      tier: payload.tier,
      verdict: payload.verdict,
      ipHash: payload.phoneHash,
      geo: null,
      src: payload.src,
      at: payload.at,
    });
  }

  /**
   * Build the short SMS reply (≤ 160 chars) for a verdict and send it via
   * the SmsPort. Delivery is best-effort: a failure is logged but never
   * propagated — the verdict was already computed and recorded.
   */
  private async sendReply(
    to: string,
    result: VerdictResult,
    reportTarget: string,
  ): Promise<void> {
    const body = this.buildSmsReply(result, reportTarget);
    try {
      await this.sms.send({ to, body });
    } catch (err) {
      this.logger.warn(
        `SMS reply delivery failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { to, verdict: result.verdict },
      );
    }
  }

  /**
   * Compose the ≤ 160-char SMS reply for a verdict.
   *
   * `reportTarget` is the tenant slug (or a fallback) used in the
   * "Report: <brand>" line for unknown/invalid verdicts.
   */
  private buildSmsReply(result: VerdictResult, reportTarget: string): string {
    const brand = result.brand?.displayName ?? '';
    // Last 4 chars of the redacted code → "Ref …XXXX"
    const refSuffix = this.refSuffix(result.code);
    const ref = refSuffix ? `Ref …${refSuffix}` : '';

    switch (result.verdict) {
      case 'authentic':
        return `${brand}: GENUINE. First verified now. ${ref}`.trim();

      case 'already-verified': {
        const count = result.history?.scanCount ?? 1;
        const dateStr = result.history?.firstVerifiedAt
          ? new Date(result.history.firstVerifiedAt).toLocaleDateString(
              'en-GB',
              { day: 'numeric', month: 'short', year: 'numeric' },
            )
          : 'n/a';
        return `${brand}: Verified ${count}x. First ${dateStr}. ${ref}`.trim();
      }

      case 'ok':
        return `${brand}: Genuine product line. ${ref}`.trim();

      case 'unknown':
      case 'invalid':
        return `NOT FOUND — likely counterfeit. Report: ${
          reportTarget || 'verifynng'
        }`;

      case 'suspicious':
        return `${brand}: MULTIPLE VERIFICATIONS across regions. ${ref}`.trim();

      case 'flagged':
        return `${brand}: FLAGGED by brand. ${ref}`.trim();

      case 'decommissioned':
        return `${brand}: WITHDRAWN. Contact seller. ${ref}`.trim();

      case 'rate-limited':
        return 'Too many attempts. Try again later.';

      default:
        return `NOT FOUND — likely counterfeit. Report: ${
          reportTarget || 'verifynng'
        }`;
    }
  }

  /** Extract the last 4 meaningful chars of a redacted code for the "Ref …". */
  private refSuffix(redactedCode: string): string {
    const stripped = redactedCode.replace(/…$/, '');
    return stripped.slice(-4);
  }
}
