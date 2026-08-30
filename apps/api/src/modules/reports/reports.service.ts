import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CAPTCHA_PORT, type CaptchaPort } from './captcha/captcha-port';
import { CONSENT_PORT, type ConsentPort } from './consent/consent-port';
import { generateUniqueReference } from './reference.util';
import type { SubmitReportDto } from './dto/submit-report.dto';

const REPORTABLE_VERDICTS = new Set([
  'red',
  'amber',
  'unknown',
  'decommissioned',
  'flagged',
]);

export interface SubmitContext {
  ip: string;
  ipHash: string;
  userAgent?: string;
  locale?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
    @Inject(CONSENT_PORT) private readonly consent: ConsentPort,
  ) {}

  async resolveTenantBySlug(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new NotFoundException('tenant_not_found');
    if (tenant.status === 'offboarded')
      throw new GoneException('tenant_offboarded');
    // Suspended/restricted tenants stay open for consumer reporting — a consumer
    // holding a suspected fake should never be blocked by the brand's billing state.
    return tenant;
  }

  async submit(
    tenantSlug: string,
    dto: SubmitReportDto,
    ctx: SubmitContext,
  ): Promise<{ reference: string; statusUrl: string; reportId: string }> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);

    const captchaResult = await this.captcha.verify(dto.captchaToken, ctx.ip);
    if (!captchaResult.ok)
      throw new ForbiddenException({
        error: 'captcha_failed',
        reason: captchaResult.reason,
      });

    const scanEvent = await this.prisma.scanEvent.findUnique({
      where: { id: dto.scanEventId },
    });
    if (!scanEvent || scanEvent.tenantId !== tenant.id)
      throw new NotFoundException('scan_event_not_found');
    if (!REPORTABLE_VERDICTS.has(scanEvent.verdict)) {
      throw new BadRequestException({
        error: 'verdict_not_reportable',
        verdict: scanEvent.verdict,
      });
    }

    const photos = await this.prisma.reportPhoto.findMany({
      where: { id: { in: dto.photoIds }, ipHash: ctx.ipHash, reportId: null },
    });
    if (photos.length !== dto.photoIds.length) {
      throw new BadRequestException({
        error: 'photo_rejected',
        reason: 'photo_not_owned_or_claimed',
      });
    }
    if (photos.some((p) => p.status === 'rejected')) {
      throw new BadRequestException({
        error: 'photo_rejected',
        reason: 'magic_mismatch',
      });
    }

    let contactConsentId: string | undefined;
    if (dto.contact?.consent && (dto.contact.email || dto.contact.phone)) {
      contactConsentId = await this.consent.record({
        subjectEmail: dto.contact.email,
        subjectPhone: dto.contact.phone,
        purpose: 'report_contact',
        tenantId: tenant.id,
        source: 'report_form',
        textVersion: 'v1',
      });
    }

    const reference = await generateUniqueReference(
      async (candidate) =>
        (await this.prisma.report.count({ where: { reference: candidate } })) >
        0,
    );

    const report = await this.prisma.report.create({
      data: {
        tenantId: tenant.id,
        reference,
        scanEventId: scanEvent.id,
        unitId: scanEvent.unitId,
        batchId: scanEvent.batchId,
        productId: scanEvent.productId,
        verdictAtReport: scanEvent.verdict,
        sellerName: dto.sellerName,
        sellerLocation: dto.sellerLocation,
        purchaseChannel: dto.purchaseChannel,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        // eslint-disable-next-line no-control-regex -- deliberate: strip ASCII control chars, never spaces/punctuation
        description: dto.description?.replace(/[\x00-\x1F\x7F]/g, ''),
        contactEmail: dto.contact?.email,
        contactPhone: dto.contact?.phone,
        contactConsentId,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        locale: ctx.locale,
      },
    });

    await this.prisma.reportPhoto.updateMany({
      where: { id: { in: dto.photoIds } },
      data: { reportId: report.id, status: 'uploaded' },
    });

    this.eventEmitter.emit('report.created', {
      tenantId: tenant.id,
      data: {
        reportId: report.id,
        tenantId: tenant.id,
        reference: report.reference,
        unitId: report.unitId,
        batchId: report.batchId,
        productId: report.productId,
        verdictAtReport: report.verdictAtReport,
        purchaseChannel: report.purchaseChannel,
        hasPhotos: dto.photoIds.length > 0,
        hasContact: Boolean(dto.contact?.email || dto.contact?.phone),
      },
    });

    if (dto.contact?.email) {
      this.eventEmitter.emit('report.consumer_ack.requested', {
        reportId: report.id,
        tenantId: tenant.id,
        email: dto.contact.email,
        reference: report.reference,
      });
    }

    return {
      reference: report.reference,
      statusUrl: `/v1/public/${tenantSlug}/reports/${report.reference}`,
      reportId: report.id,
    };
  }

  async listPhotoIds(reportId: string): Promise<string[]> {
    const photos = await this.prisma.reportPhoto.findMany({
      where: { reportId },
      select: { id: true },
    });
    return photos.map((p) => p.id);
  }

  async getPublicStatus(
    tenantSlug: string,
    reference: string,
  ): Promise<{ status: string; outcome?: string; updatedAt: string }> {
    const tenant = await this.resolveTenantBySlug(tenantSlug);
    const report = await this.prisma.report.findUnique({
      where: { reference },
    });
    if (!report || report.tenantId !== tenant.id)
      throw new NotFoundException('report_not_found');
    return {
      status: report.status,
      outcome: report.outcome ?? undefined,
      updatedAt: report.updatedAt.toISOString(),
    };
  }
}
