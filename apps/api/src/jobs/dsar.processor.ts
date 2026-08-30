import { Injectable } from '@nestjs/common';
import { prisma } from '@verifynng/db';
import { loadEnv } from '@verifynng/config';
import { EventsService } from '../common/events.service';
import { NotificationService } from '../modules/notifications/notifications.service';
import { LegalHoldService } from '../modules/dsar/legal-hold.service';
import { DsarStorageService } from '../modules/dsar/dsar-storage.service';
import { DsarEmailCache } from '../modules/dsar/dsar-email-cache.service';
import { TenantS3Service } from '../modules/tenants/s3.service';
import { TenantOffboardingProcessor } from './tenant-offboarding.processor';

export interface ConsumerFulfilJob {
  dsarRequestId: string;
}
export interface TenantExportJob {
  dsarRequestId: string;
  tenantId: string;
  requestedByUserId: string;
}

@Injectable()
export class DsarProcessor {
  constructor(
    private readonly events: EventsService,
    private readonly notifications: NotificationService,
    private readonly legalHold: LegalHoldService,
    private readonly dsarStorage: DsarStorageService,
    private readonly emailCache: DsarEmailCache,
    private readonly tenantStorage: TenantS3Service,
    private readonly offboarding: TenantOffboardingProcessor,
  ) {}

  /**
   * There is no real Report data to export yet (E08 hasn't shipped) — this
   * assembles whatever E19-owned data exists for the subject (consent
   * records) so the bundle shape and isolation properties are correct now;
   * E08's report/scan data slots into `bundle.reports` once that model
   * exists.
   */
  async fulfilConsumerExport(job: ConsumerFulfilJob): Promise<void> {
    const request = await prisma.dsarRequest.findUniqueOrThrow({
      where: { id: job.dsarRequestId },
    });
    const email = await this.emailCache.takeAndClear(request.id);
    if (await this.rejectIfHeld(request.id, request.subjectRef, 'export'))
      return;

    const consentRecords = await prisma.consentRecord.findMany({
      where: { subjectType: 'consumer', subjectRef: request.subjectRef },
    });
    const bundle = {
      reports: [], // pending E08 (no Report model yet)
      consentRecords,
      scanEventsLinkedToReport: [], // pending E08
      legalDocumentsVersionsSeen: [],
    };
    const env = loadEnv();
    const key = `${request.id}.json`;
    await this.dsarStorage.put(
      key,
      Buffer.from(JSON.stringify(bundle, null, 2)),
      'application/json',
    );
    const downloadUrl = await this.dsarStorage.presignGet(
      key,
      Math.round(env.DSAR_EXPORT_TTL_HOURS * 3600),
    );
    await prisma.dsarRequest.update({
      where: { id: request.id },
      data: {
        status: 'completed',
        exportObjectKey: key,
        exportExpiresAt: new Date(
          Date.now() + env.DSAR_EXPORT_TTL_HOURS * 3600_000,
        ),
        completedAt: new Date(),
      },
    });
    if (email) {
      await this.notifications.send(
        'dsar.ready',
        { email },
        { downloadUrl, expiresIn: `${env.DSAR_EXPORT_TTL_HOURS} hours` },
        { tenantId: request.tenantId ?? undefined },
      );
    }
    await this.events.emit('dsar.completed', {
      dsarRequestId: request.id,
      action: 'export',
      outcome: 'exported',
      at: new Date().toISOString(),
    });
  }

  async fulfilConsumerErase(job: ConsumerFulfilJob): Promise<void> {
    const request = await prisma.dsarRequest.findUniqueOrThrow({
      where: { id: job.dsarRequestId },
    });
    const email = await this.emailCache.takeAndClear(request.id);
    if (await this.rejectIfHeld(request.id, request.subjectRef, 'erase'))
      return;

    // Pending E08: erasing contactEmail/contactPhone/photos on the
    // underlying Report happens here once that model exists.
    await prisma.consentRecord.create({
      data: {
        tenantId: request.tenantId,
        subjectType: 'consumer',
        subjectRef: request.subjectRef,
        purpose: 'contact_followup',
        granted: false,
        source: 'import',
      },
    });
    await prisma.dsarRequest.update({
      where: { id: request.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    if (email) {
      await this.notifications.send(
        'dsar.erased',
        { email },
        { requestedAt: request.requestedAt.toISOString() },
        { tenantId: request.tenantId ?? undefined },
      );
    }
    await this.events.emit('dsar.completed', {
      dsarRequestId: request.id,
      action: 'erase',
      outcome: 'erased',
      at: new Date().toISOString(),
    });
  }

  async fulfilTenantExport(job: TenantExportJob): Promise<void> {
    const tenantExport = await prisma.tenantExport.create({
      data: { tenantId: job.tenantId, status: 'queued' },
    });
    await this.offboarding.runExport(job.tenantId, tenantExport.id);
    const updated = await prisma.tenantExport.findUniqueOrThrow({
      where: { id: tenantExport.id },
    });
    const [consentRecords, acceptances] = await Promise.all([
      prisma.consentRecord.findMany({ where: { tenantId: job.tenantId } }),
      prisma.policyAcceptance.findMany({ where: { tenantId: job.tenantId } }),
    ]);
    const supplementKey = `tenants/${job.tenantId}/exports/${tenantExport.id}-e19.json`;
    await this.tenantStorage.put(
      supplementKey,
      Buffer.from(
        JSON.stringify({ consents: consentRecords, acceptances }, null, 2),
      ),
      'application/json',
    );
    const env = loadEnv();
    const ttlSeconds = Math.round(env.DSAR_EXPORT_TTL_HOURS * 3600);
    const downloadUrl = updated.objectKey
      ? await this.tenantStorage.presignGet(updated.objectKey, ttlSeconds)
      : undefined;
    await prisma.dsarRequest.update({
      where: { id: job.dsarRequestId },
      data: {
        status: updated.status === 'done' ? 'completed' : 'rejected',
        exportObjectKey: updated.objectKey,
        exportExpiresAt: new Date(Date.now() + ttlSeconds * 1000),
        completedAt: new Date(),
        outcomeNote: `supplement:${supplementKey}`,
      },
    });
    if (downloadUrl) {
      // NotificationService resolves the delivery channel from
      // recipient.email/phone, not recipientUserId (that field is only
      // used for suppression/outbox tracking) — an explicit email is
      // required or send() silently defaults to the sms channel with no
      // phone number and never creates an outbox row.
      const requester = await prisma.user.findUnique({
        where: { id: job.requestedByUserId },
        select: { email: true },
      });
      await this.notifications.send(
        'dsar.ready',
        { email: requester?.email, userId: job.requestedByUserId },
        { downloadUrl, expiresIn: `${env.DSAR_EXPORT_TTL_HOURS} hours` },
        { tenantId: job.tenantId },
      );
    }
    await this.events.emit('dsar.completed', {
      dsarRequestId: job.dsarRequestId,
      action: 'export',
      outcome: downloadUrl ? 'exported' : 'rejected_legal_hold',
      at: new Date().toISOString(),
    });
  }

  private async rejectIfHeld(
    dsarRequestId: string,
    subjectRef: string,
    action: 'export' | 'erase',
  ): Promise<boolean> {
    const held = await this.legalHold.isHeld('consumer', subjectRef);
    if (!held) return false;
    await prisma.dsarRequest.update({
      where: { id: dsarRequestId },
      data: {
        status: 'rejected',
        outcomeNote: 'legal_hold',
        completedAt: new Date(),
      },
    });
    await this.events.emit('dsar.completed', {
      dsarRequestId,
      action,
      outcome: 'rejected_legal_hold',
      at: new Date().toISOString(),
    });
    return true;
  }
}
