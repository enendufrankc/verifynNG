import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CAPTCHA_PORT, type CaptchaPort } from './captcha/captcha-port';
import { CONSENT_PORT, type ConsentPort } from './consent/consent-port';
import { generateUniqueReference } from './reference.util';
import type { SubmitReportDto } from './dto/submit-report.dto';
import { NotificationService } from '../notifications/notifications.service';

const REPORTABLE_VERDICTS = new Set([
  'red',
  'amber',
  'unknown',
  'decommissioned',
  'flagged',
]);

const TRANSITIONS: Record<string, string[]> = {
  new: ['triaged', 'closed'],
  triaged: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: ['investigating'],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SubmitContext {
  ip: string;
  ipHash: string;
  userAgent?: string;
  locale?: string;
  // Set by ReportsPublicController once it has already verified the captcha
  // token itself (ahead of the quota check). Skips the redundant re-verify
  // below so a valid submission doesn't hit the captcha provider twice.
  captchaVerified?: boolean;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CAPTCHA_PORT) private readonly captcha: CaptchaPort,
    @Inject(CONSENT_PORT) private readonly consent: ConsentPort,
    private readonly notifications: NotificationService,
  ) {}

  /** Falls back to a generic label rather than failing the notification. */
  private async resolveProductName(productId: string | null): Promise<string> {
    if (!productId) return 'your product';
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    return product?.name ?? 'your product';
  }

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

    if (!ctx.captchaVerified) {
      const captchaResult = await this.captcha.verify(dto.captchaToken, ctx.ip);
      if (!captchaResult.ok)
        throw new ForbiddenException({
          error: 'captcha_failed',
          reason: captchaResult.reason,
        });
    }

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

    const statusUrl = `/v1/public/${tenantSlug}/reports/${report.reference}`;

    if (dto.contact?.email) {
      const productName = await this.resolveProductName(report.productId);
      try {
        await this.notifications.send(
          'report.consumer_ack',
          { email: dto.contact.email },
          { reference: report.reference, productName, statusUrl },
          { tenantId: tenant.id },
        );
      } catch (err) {
        this.logger.error(
          `report.consumer_ack notification failed for report ${report.id}: ${(err as Error).message}`,
        );
      }
    }

    return {
      reference: report.reference,
      statusUrl,
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

  // — Admin —

  async list(
    tenantId: string,
    opts: {
      status?: string;
      outcome?: string;
      assignedToId?: string;
      batchId?: string;
      from?: string;
      to?: string;
      q?: string;
      cursor?: string;
    },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.outcome) where.outcome = opts.outcome;
    if (opts.assignedToId) where.assignedToId = opts.assignedToId;
    if (opts.batchId) where.batchId = opts.batchId;
    if (opts.from || opts.to) {
      where.createdAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    if (opts.q) {
      where.OR = [
        { reference: { contains: opts.q, mode: 'insensitive' } },
        { sellerName: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    return this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      cursor: opts.cursor ? { id: opts.cursor } : undefined,
      skip: opts.cursor ? 1 : 0,
      include: { photos: true },
    });
  }

  async summary(tenantId: string) {
    const [newCount, triaged, investigating, closed, byOutcomeRows] =
      await Promise.all([
        this.prisma.report.count({ where: { tenantId, status: 'new' } }),
        this.prisma.report.count({ where: { tenantId, status: 'triaged' } }),
        this.prisma.report.count({
          where: { tenantId, status: 'investigating' },
        }),
        this.prisma.report.count({ where: { tenantId, status: 'closed' } }),
        this.prisma.report.groupBy({
          by: ['outcome'],
          where: { tenantId, outcome: { not: null } },
          _count: true,
        }),
      ]);
    const byOutcome = Object.fromEntries(
      byOutcomeRows.map((r) => [r.outcome, r._count]),
    );
    return { new: newCount, triaged, investigating, closed, byOutcome };
  }

  async detail(tenantId: string, id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        photos: true,
        notes: { orderBy: { createdAt: 'asc' } },
        statusChanges: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!report || report.tenantId !== tenantId)
      throw new NotFoundException('report_not_found');
    return report;
  }

  async assign(
    tenantId: string,
    id: string,
    memberId: string,
    actorId: string,
  ): Promise<void> {
    const report = await this.detail(tenantId, id);
    await this.prisma.report.update({
      where: { id: report.id },
      data: { assignedToId: memberId },
    });
    this.eventEmitter.emit('report.assigned', {
      reportId: report.id,
      tenantId,
      assignedToId: memberId,
      actorId,
    });
  }

  async addNote(
    tenantId: string,
    id: string,
    authorId: string,
    body: string,
  ): Promise<void> {
    const report = await this.detail(tenantId, id);
    await this.prisma.reportNote.create({
      data: { tenantId, reportId: report.id, authorId, body },
    });
  }

  async changeStatus(
    tenantId: string,
    id: string,
    actorId: string,
    input: {
      status: string;
      outcome?: string;
      note?: string;
      notifyConsumer?: boolean;
    },
  ): Promise<void> {
    const report = await this.detail(tenantId, id);
    if (!canTransition(report.status, input.status)) {
      throw new BadRequestException({
        error: 'invalid_transition',
        from: report.status,
        to: input.status,
      });
    }
    if (input.status === 'closed' && !input.outcome) {
      throw new BadRequestException({ error: 'outcome_required' });
    }
    await this.prisma.$transaction(async (tx) => {
      // Scope the write to the status we read: if another request already
      // moved this report on, the WHERE clause matches zero rows and we
      // reject rather than silently overwrite a transition we never validated.
      const { count } = await tx.report.updateMany({
        where: { id: report.id, status: report.status },
        data: {
          status: input.status as never,
          outcome:
            (input.outcome as never) ??
            (input.status === 'closed' ? report.outcome : undefined),
          closedAt: input.status === 'closed' ? new Date() : null,
        },
      });
      if (count === 0) {
        throw new ConflictException('report_status_changed_concurrently');
      }
      await tx.reportStatusChange.create({
        data: {
          tenantId,
          reportId: report.id,
          fromStatus: report.status,
          toStatus: input.status as never,
          outcome: input.outcome as never,
          note: input.note,
          actorId,
          consumerNotified: Boolean(
            input.notifyConsumer && report.contactEmail,
          ),
        },
      });
    });
    this.eventEmitter.emit('report.status.changed', {
      reportId: report.id,
      tenantId,
      reference: report.reference,
      from: report.status,
      to: input.status,
      outcome: input.outcome,
      actorId,
    });
    if (input.notifyConsumer && report.contactEmail) {
      const [tenant, productName] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true },
        }),
        this.resolveProductName(report.productId),
      ]);
      try {
        await this.notifications.send(
          'report.consumer_update',
          { email: report.contactEmail },
          {
            reference: report.reference,
            productName,
            status: input.status,
            outcome: input.outcome,
            statusUrl: `/v1/public/${tenant?.slug}/reports/${report.reference}`,
          },
          { tenantId },
        );
      } catch (err) {
        this.logger.error(
          `report.consumer_update notification failed for report ${report.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  async *streamForExport(
    tenantId: string,
    opts: { status?: string; outcome?: string; from?: string; to?: string },
    includeContact: boolean,
  ) {
    const header = [
      'reference',
      'createdAt',
      'status',
      'outcome',
      'verdict',
      'productId',
      'batchId',
      'unitId',
      'purchaseChannel',
      'sellerName',
      'sellerLocation',
      'assignedToId',
      'photoCount',
      ...(includeContact ? ['contactEmail', 'contactPhone'] : []),
    ];
    yield header;

    let cursor: string | undefined;
    for (;;) {
      const where: Record<string, unknown> = { tenantId };
      if (opts.status) where.status = opts.status;
      if (opts.outcome) where.outcome = opts.outcome;
      if (opts.from || opts.to) {
        where.createdAt = {
          ...(opts.from ? { gte: new Date(opts.from) } : {}),
          ...(opts.to ? { lte: new Date(opts.to) } : {}),
        };
      }
      const batch = await this.prisma.report.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 500,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        include: { _count: { select: { photos: true } } },
      });
      if (batch.length === 0) break;
      for (const r of batch) {
        yield [
          r.reference,
          r.createdAt.toISOString(),
          r.status,
          r.outcome ?? '',
          r.verdictAtReport,
          r.productId ?? '',
          r.batchId ?? '',
          r.unitId ?? '',
          r.purchaseChannel,
          r.sellerName ?? '',
          r.sellerLocation ?? '',
          r.assignedToId ?? '',
          r._count.photos,
          ...(includeContact
            ? [r.contactEmail ?? '', r.contactPhone ?? '']
            : []),
        ];
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < 500) break;
    }
  }
}
