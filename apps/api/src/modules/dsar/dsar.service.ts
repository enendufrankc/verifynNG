import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@verifynng/db';
import { loadEnv } from '@verifynng/config';
import type { DsarAction, DsarRequest } from '@prisma/client';
import { EventsService } from '../../common/events.service';
import { hashConsumerSubject } from '../../common/subject-hash';
import { DsarQueue } from '../../jobs/dsar.queue';
import { NotificationService } from '../notifications/notifications.service';
import { DsarStorageService } from './dsar-storage.service';
import { DsarEmailCache } from './dsar-email-cache.service';
import { REPORT_LOOKUP_PORT } from './report-lookup.port';
import type { ReportLookupPort } from './report-lookup.port';
import { Inject } from '@nestjs/common';

const VERIFY_WINDOW_SECONDS = 30 * 60;

@Injectable()
export class DsarService {
  constructor(
    private readonly events: EventsService,
    private readonly queue: DsarQueue,
    private readonly storage: DsarStorageService,
    private readonly emailCache: DsarEmailCache,
    private readonly notifications: NotificationService,
    @Inject(REPORT_LOOKUP_PORT) private readonly reportLookup: ReportLookupPort,
  ) {}

  /** Always resolves — the caller (controller) always returns 202 regardless
   * of outcome, so a leaked report reference alone reveals nothing. */
  async requestConsumer(input: {
    referenceNumber: string;
    email: string;
    action: DsarAction;
  }): Promise<void> {
    const subjectRef = hashConsumerSubject(input.email);
    const lookup = await this.reportLookup.findByReference(
      input.referenceNumber,
    );
    if (!lookup) return;
    if (hashConsumerSubject(lookup.contactEmail) !== subjectRef) return;

    const token = randomBytes(32).toString('hex');
    const verifyTokenHash = createHash('sha256').update(token).digest('hex');
    const request = await prisma.dsarRequest.create({
      data: {
        tenantId: lookup.tenantId,
        subjectType: 'consumer',
        action: input.action,
        subjectRef,
        lookupRef: input.referenceNumber,
        status: 'pending_verification',
        verifyTokenHash,
        verifyExpiresAt: new Date(Date.now() + VERIFY_WINDOW_SECONDS * 1000),
      },
    });
    await this.emailCache.set(request.id, input.email, VERIFY_WINDOW_SECONDS);
    await this.events.emit('dsar.requested', {
      dsarRequestId: request.id,
      subjectType: 'consumer',
      action: input.action,
      tenantId: lookup.tenantId,
      at: new Date().toISOString(),
    });
    const verifyUrl = `${loadEnv().VERIFY_BASE_URL}/dsar/verify?token=${request.id}.${token}`;
    await this.notifications.send(
      'dsar.verify',
      { email: input.email },
      { verifyUrl, expiresIn: '30 minutes' },
      { tenantId: lookup.tenantId },
    );
  }

  async verifyConsumer(rawToken: string): Promise<{ status: string }> {
    const [id, secret] = rawToken.split('.');
    if (!id || !secret) throw new BadRequestException('invalid_token');
    const request = await prisma.dsarRequest.findUnique({ where: { id } });
    if (
      !request ||
      request.status !== 'pending_verification' ||
      !request.verifyTokenHash ||
      !request.verifyExpiresAt
    ) {
      throw new BadRequestException('invalid_token');
    }
    if (request.verifyExpiresAt < new Date()) {
      await prisma.dsarRequest.update({
        where: { id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('token_expired');
    }
    const hash = createHash('sha256').update(secret).digest('hex');
    if (hash !== request.verifyTokenHash) {
      throw new BadRequestException('invalid_token');
    }
    await prisma.dsarRequest.update({
      where: { id },
      data: { status: 'verified' },
    });
    if (request.action === 'export') {
      await this.queue.enqueueConsumerExport({ dsarRequestId: id });
    } else {
      await this.queue.enqueueConsumerErase({ dsarRequestId: id });
    }
    return { status: 'verified' };
  }

  async downloadConsumerExportUrl(
    id: string,
    rawToken: string,
  ): Promise<string> {
    const request = await prisma.dsarRequest.findUnique({ where: { id } });
    if (!request || !request.verifyTokenHash) {
      throw new NotFoundException('dsar_request_not_found');
    }
    const hash = createHash('sha256').update(rawToken).digest('hex');
    if (hash !== request.verifyTokenHash) {
      throw new ForbiddenException('invalid_token');
    }
    if (request.status !== 'completed' || !request.exportObjectKey) {
      throw new NotFoundException('export_not_ready');
    }
    if (request.exportExpiresAt && request.exportExpiresAt < new Date()) {
      throw new ForbiddenException('export_expired');
    }
    return this.storage.presignGet(request.exportObjectKey, 900);
  }

  async requestTenantExport(
    tenantId: string,
    requestedByUserId: string,
  ): Promise<DsarRequest> {
    const request = await prisma.dsarRequest.create({
      data: {
        tenantId,
        subjectType: 'tenant',
        action: 'export',
        subjectRef: tenantId,
        status: 'processing',
      },
    });
    await this.events.emit('dsar.requested', {
      dsarRequestId: request.id,
      subjectType: 'tenant',
      action: 'export',
      tenantId,
      at: new Date().toISOString(),
    });
    await this.queue.enqueueTenantExport({
      dsarRequestId: request.id,
      tenantId,
      requestedByUserId,
    });
    return request;
  }

  async getTenantDsar(tenantId: string, id: string): Promise<DsarRequest> {
    const request = await prisma.dsarRequest.findFirst({
      where: { id, tenantId },
    });
    if (!request) throw new NotFoundException('dsar_request_not_found');
    return request;
  }

  async listTenantDsar(tenantId: string): Promise<DsarRequest[]> {
    return prisma.dsarRequest.findMany({
      where: { tenantId, subjectType: 'tenant' },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
