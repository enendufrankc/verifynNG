import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request, Response } from 'express';
import { ApiOperation, ApiResponse, ApiQuery, ApiTags } from '@nestjs/swagger';

import {
  normalizeCode,
  verifyChecksum,
  hashForStorage,
  redactCode,
  StaticKeyRing,
} from '@verifynng/core';
import { PrismaClient } from '@prisma/client';

import { VerdictEngine, VerdictContext, VerdictResult } from './verdict-engine';
import { ScanEventsService } from '../scan-events/scan-events.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { EnumerationDetector } from '../rate-limit/enumeration-detector';
import { GeoIpPort, GEO_IP_PORT } from '../geoip/geoip.port';
import { Public } from '../../common/public.decorator';
import { getClientIp, hashIp } from '../../common/ip-utils';
import { VerifyResponseDto } from './dto/verify-response.dto';

/**
 * VerifyController — public verification endpoint.
 *
 * GET /v1/verify/:code
 *   The main consumer-facing route. Parses, rate-limits, looks up the unit,
 *   runs the VerdictEngine, records a ScanEvent, and emits `scan.recorded`.
 *
 *   Always HTTP 200 for well-formed requests (the verdict carries the outcome);
 *   HTTP 429 when a rate limit fires; HTTP 503 when an infra dependency
 *   (Redis / Postgres) is down — never a false verdict.
 *
 * GET /v1/verify/_schema
 *   Returns the JSON schema of VerifyResponse.
 */
@ApiTags('verify')
@Controller('v1/verify')
export class VerifyController {
  private readonly logger = new Logger(VerifyController.name);
  private readonly keyRing: StaticKeyRing;
  private readonly trustProxy: boolean;
  private readonly ipSalt: string;
  private readonly rateLimitIpPerMin: number;
  private readonly rateLimitCodePerMin: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaClient,
    private readonly verdictEngine: VerdictEngine,
    private readonly scanEvents: ScanEventsService,
    private readonly rateLimit: RateLimitService,
    private readonly enumerationDetector: EnumerationDetector,
    @Inject(GEO_IP_PORT) private readonly geoIp: GeoIpPort,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.keyRing = new StaticKeyRing(
      configService.get<string>('CORE_KEYS')!,
      configService.get<string>('CORE_ACTIVE_KID')!,
    );
    this.trustProxy = configService.get<boolean>('TRUST_PROXY')!;
    this.ipSalt = configService.get<string>('IP_HASH_SALT')!;
    this.rateLimitIpPerMin = configService.get<number>('RATE_LIMIT_IP_PER_MIN')!;
    this.rateLimitCodePerMin =
      configService.get<number>('RATE_LIMIT_CODE_PER_MIN')!;
  }

  // -------------------------------------------------------------------------
  // GET /v1/verify/:code
  // -------------------------------------------------------------------------

  @Public()
  @Get(':code')
  @ApiOperation({ summary: 'Verify a unit code' })
  @ApiQuery({
    name: 'src',
    required: false,
    enum: ['qr', 'manual', 'sms'],
    description: 'Scan source (default: qr)',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
    type: VerifyResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limited',
    type: VerifyResponseDto,
  })
  @ApiResponse({ status: 503, description: 'Infrastructure unavailable' })
  async verify(
    @Param('code') rawCode: string,
    @Query('src') src: 'qr' | 'manual' | 'sms' = 'qr',
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers() headers: Record<string, string>,
  ): Promise<VerifyResponseDto> {
    const startedAt = Date.now();
    const requestId = headers['x-request-id'] ?? '-';
    const logCtx = { requestId, code: rawCode };

    // The last applied rate limit — surfaced as response headers.
    const setRateHeaders = (limit: number, remaining: number) => {
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
    };

    try {
      // --- 1. Parse + checksum (no DB / Redis hit) ---------------------
      const normalizedCode = normalizeCode(rawCode);
      const redacted = redactCode(rawCode);
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

      // --- 2. Invalid → return immediately (no DB hit) ------------------
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

        // Observe the invalid scan for enumeration detection.
        const ip = getClientIp(
          headers,
          req.socket.remoteAddress,
          this.trustProxy,
        );
        if (ip) {
          try {
            const ipHash = hashIp(ip, this.ipSalt);
            await this.enumerationDetector.observeInvalid(ipHash, parsed?.tenant);
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
        }

        // No tenant known for an unparseable code, so no ScanEvent row.
        return this.toResponseDto(result, null, []);
      }

      const tier = parsed.tier;
      const tenantSlug = parsed.tenant;

      // --- 3. IP + GeoIP (best-effort) ----------------------------------
      const ip = getClientIp(
        headers,
        req.socket.remoteAddress,
        this.trustProxy,
      );
      let ipHash: string | null = null;
      if (ip) ipHash = hashIp(ip, this.ipSalt);

      let geoResult: {
        country: string | null;
        city: string | null;
      } | null = null;
      if (ip) {
        try {
          const looked = await this.geoIp.lookup(ip);
          geoResult = looked
            ? { country: looked.country, city: looked.city }
            : null;
        } catch (err) {
          this.logger.warn(
            `GeoIP lookup failed for ${ip}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            logCtx,
          );
        }
      }

      // --- 4. Rate limits -------------------------------------------------
      let rateLimited = false;
      let retryAfterSec: number | undefined;

      try {
        // 4a. IP hard-block (enumeration)
        if (ipHash) {
          const blocked = await this.rateLimit.isBlocked(`ip:${ipHash}`);
          if (blocked) {
            rateLimited = true;
            retryAfterSec = this.configService.get<number>(
              'ENUMERATION_BLOCK_SEC',
            )!;
            res.setHeader(
              'Retry-After',
              String(retryAfterSec),
            );
          }
        }

        // 4b. Per-IP
        if (!rateLimited && ipHash) {
          const rl = await this.rateLimit.hit(
            `rl:ip:${ipHash}`,
            this.rateLimitIpPerMin,
            60,
          );
          setRateHeaders(this.rateLimitIpPerMin, rl.remaining);
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // 4c. Tenant lookup (needed for per-tenant limit + verdict)
        let tenant: {
          id: string;
          slug: string;
          status: 'pending' | 'active' | 'suspended' | 'offboarded';
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

        // 4d. Per-tenant
        if (!rateLimited && tenant) {
          const rl = await this.rateLimit.hit(
            `rl:tenant:${tenant.id}`,
            tenant.verifyRateLimitPerMin,
            60,
          );
          setRateHeaders(tenant.verifyRateLimitPerMin, rl.remaining);
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // 4e. Per-code (tier 2 only)
        if (!rateLimited && tier === 2) {
          const tier2Hash = hashForStorage(normalizedCode);
          const rl = await this.rateLimit.hit(
            `rl:code:${tier2Hash}`,
            this.rateLimitCodePerMin,
            60,
          );
          setRateHeaders(this.rateLimitCodePerMin, rl.remaining);
          if (!rl.allowed) {
            rateLimited = true;
            retryAfterSec = rl.retryAfterSec;
          }
        }

        // --- 5. Offboarded tenant → unknown (no unit lookup) ----------
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
            source: src,
            code: rawCode,
            redactedCode: redacted,
            ip,
            userAgent: headers['user-agent'] ?? null,
            batchId: null,
            productId: null,
            geoCountry: geoResult?.country ?? null,
            geoCity: geoResult?.city ?? null,
            latencyMs: Date.now() - startedAt,
          });

          this.emitScanRecorded({
            scanEventId: scanEvent.id,
            tenantId: tenant.id,
            unitId: null,
            batchId: null,
            tier,
            verdict: result.verdict,
            ipHash,
            geo: geoResult,
            src,
            at: scanEvent.createdAt,
          });

          if (rateLimited) this.throwRateLimited(result, retryAfterSec, res);
          return this.toResponseDto(result, scanEvent.id, []);
        }

        // --- 6. Unit lookup (tier-gated) ------------------------------
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
              where: { tier1Code: normalizedCode },
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
            const tier2Hash = hashForStorage(normalizedCode);
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

        // --- 7. Prior tier-2 scans (for history / signals) ----------
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

        // --- 8. Evaluate verdict -------------------------------------
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

        // --- 9. Record scan event -----------------------------------
        const tenantIdForRecord = tenant?.id ?? unit?.tenantId ?? '';
        let scanEventId: string | null = null;

        if (tenantIdForRecord) {
          try {
            const scanEvent = await this.recordScan({
              tenantId: tenantIdForRecord,
              unitId: unit?.id ?? null,
              tier,
              verdict: result.verdict,
              source: src,
              code: rawCode,
              redactedCode: redacted,
              ip,
              userAgent: headers['user-agent'] ?? null,
              batchId: unit?.batchId ?? null,
              productId: product?.id ?? null,
              geoCountry: geoResult?.country ?? null,
              geoCity: geoResult?.city ?? null,
              latencyMs: Date.now() - startedAt,
            });
            scanEventId = scanEvent.id;

            // --- 10. Emit scan.recorded -----------------------------
            this.emitScanRecorded({
              scanEventId: scanEvent.id,
              tenantId: tenantIdForRecord,
              unitId: unit?.id ?? null,
              batchId: unit?.batchId ?? null,
              tier,
              verdict: result.verdict,
              ipHash,
              geo: geoResult,
              src,
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

        // --- 11. Observe invalid for enumeration (tier-2 unknown) ---
        if (result.verdict === 'unknown' && ipHash) {
          try {
            await this.enumerationDetector.observeInvalid(ipHash, tenantSlug);
          } catch (err) {
            this.logger.warn(
              `enumeration observe failed: ${
                err instanceof Error ? err.message : String(err)
              }`,
              logCtx,
            );
          }
        }

        // --- 12. Build response ------------------------------------
        const distinctRegions = this.computeDistinctRegions(
          priorScans,
          geoResult,
        );

        if (rateLimited) this.throwRateLimited(result, retryAfterSec, res);
        return this.toResponseDto(result, scanEventId, distinctRegions);
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
        'unexpected error during verification — returning 503',
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
  // GET /v1/verify/_schema
  // -------------------------------------------------------------------------

  @Public()
  @Get('_schema')
  @ApiOperation({ summary: 'JSON schema of VerifyResponse' })
  @ApiResponse({
    status: 200,
    description: 'OpenAPI schema for VerifyResponse',
  })
  schema(): Record<string, unknown> {
    // Placeholder JSON schema — replaced by generated OpenAPI once the
    // openapi:generate pipeline is wired.
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'VerifyResponse',
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: [
            'invalid',
            'unknown',
            'ok',
            'authentic',
            'already-verified',
            'suspicious',
            'flagged',
            'decommissioned',
            'rate-limited',
          ],
        },
        severity: {
          type: 'string',
          enum: ['green', 'amber', 'red', 'grey'],
        },
        tier: { type: 'integer', enum: [1, 2] },
        code: { type: 'string' },
        brand: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            displayName: { type: 'string' },
            logoUrl: { type: 'string' },
          },
        },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            sku: { type: 'string' },
            gtin: { type: 'string' },
          },
        },
        batch: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            oem: { type: 'string' },
            commissionedAt: { type: 'string' },
          },
        },
        message: { type: 'string' },
        history: {
          type: 'object',
          properties: {
            firstVerifiedAt: { type: ['string', 'null'] },
            scanCount: { type: 'integer' },
            distinctRegions: { type: 'array', items: { type: 'string' } },
            lastVerifiedAt: { type: ['string', 'null'] },
          },
        },
        signals: {
          type: 'object',
          properties: {
            first: { type: 'boolean' },
            multiRegion: { type: 'boolean' },
            highCount: { type: 'boolean' },
            flagged: { type: 'boolean' },
          },
        },
        retryAfterSec: { type: 'integer' },
        reportable: { type: 'boolean' },
        scanEventId: { type: 'string' },
      },
      required: ['verdict', 'severity', 'code', 'message', 'reportable'],
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async recordScan(args: {
    tenantId: string;
    unitId: string | null;
    tier: 1 | 2;
    verdict: string;
    source: 'qr' | 'manual' | 'sms';
    code: string;
    redactedCode: string;
    ip: string | null;
    userAgent: string | null;
    batchId: string | null;
    productId: string | null;
    geoCountry: string | null;
    geoCity: string | null;
    latencyMs: number;
  }) {
    return this.scanEvents.record({
      tenantId: args.tenantId,
      unitId: args.unitId,
      tier: args.tier === 1 ? 'tier1' : 'tier2',
      verdict: args.verdict,
      source: args.source,
      code: args.code,
      redactedCode: args.redactedCode,
      ip: args.ip,
      userAgent: args.userAgent,
      batchId: args.batchId,
      productId: args.productId,
      geoCountry: args.geoCountry,
      geoCity: args.geoCity,
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
    ipHash: string | null;
    geo: { country: string | null; city: string | null } | null;
    src: string;
    at: Date;
  }) {
    this.eventEmitter.emit('scan.recorded', payload);
  }

  private computeDistinctRegions(
    priorScans: Array<{
      geoCity: string | null;
      geoCountry: string | null;
    }>,
    currentGeo: { country: string | null; city: string | null } | null,
  ): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (region: string) => {
      if (region && !seen.has(region)) {
        seen.add(region);
        out.push(region);
      }
    };

    for (const scan of priorScans) {
      const city = scan.geoCity?.trim() || null;
      const country = scan.geoCountry?.trim() || null;
      if (city && country) add(`${city}, ${country}`);
      else if (city) add(city);
      else if (country) add(country);
    }

    if (currentGeo) {
      const city = currentGeo.city?.trim() || null;
      const country = currentGeo.country?.trim() || null;
      if (city && country) add(`${city}, ${country}`);
      else if (city) add(city);
      else if (country) add(country);
    }

    return out;
  }

  private toResponseDto(
    result: VerdictResult,
    scanEventId: string | null,
    distinctRegions: string[],
  ): VerifyResponseDto {
    const dto = new VerifyResponseDto();
    dto.verdict = result.verdict;
    dto.severity = result.severity;
    dto.tier = result.tier;
    dto.code = result.code;
    dto.message = result.message;
    dto.reportable = result.reportable;
    dto.retryAfterSec = result.retryAfterSec;
    if (scanEventId) dto.scanEventId = scanEventId;

    if (result.brand) {
      dto.brand = {
        slug: result.brand.slug,
        displayName: result.brand.displayName,
        logoUrl: result.brand.logoUrl,
      };
    }
    if (result.product) {
      dto.product = {
        id: result.product.id,
        name: result.product.name,
        sku: result.product.sku,
        gtin: result.product.gtin,
      };
    }
    if (result.batch) {
      dto.batch = {
        id: result.batch.id,
        oem: result.batch.oem,
        commissionedAt: result.batch.commissionedAt,
      };
    }
    if (result.history) {
      dto.history = {
        firstVerifiedAt: result.history.firstVerifiedAt,
        scanCount: result.history.scanCount,
        distinctRegions:
          distinctRegions.length > 0
            ? distinctRegions
            : result.history.distinctRegions,
        lastVerifiedAt: result.history.lastVerifiedAt,
      };
    }
    if (result.signals) {
      dto.signals = {
        first: result.signals.first,
        multiRegion: result.signals.multiRegion,
        highCount: result.signals.highCount,
        flagged: result.signals.flagged,
      };
    }

    return dto;
  }

  /**
   * Throw a 429 carrying the rate-limited verdict body and set the
   * `Retry-After` header. Throwing (rather than returning) keeps the HTTP
   * status correct while Nest still serializes the body.
   */
  private throwRateLimited(
    result: VerdictResult,
    retryAfterSec: number | undefined,
    res: Response,
  ): never {
    if (retryAfterSec) res.setHeader('Retry-After', String(retryAfterSec));

    const body = new VerifyResponseDto();
    body.verdict = result.verdict;
    body.severity = result.severity;
    body.tier = result.tier;
    body.code = result.code;
    body.message = result.message;
    body.reportable = result.reportable;
    body.retryAfterSec = retryAfterSec;

    throw new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}