import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, PrintReceipt } from '@prisma/client';
import { receiptHash } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../../common/events.service';
import { NotificationService } from '../notifications/notifications.service';
import { BatchLifecycleService } from './batch-lifecycle.service';
import { DeliveryService } from './delivery.service';
import { compareReceipt, sameWatermarkSet } from './receipt-compare.util';
import type { OemContext } from './guards/oem-scope.guard';

export interface ReceiptInput {
  receiptHash: string;
  codeCount: number;
  watermarks: string[];
}

@Injectable()
export class ReceiptService {
  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private deliveryService: DeliveryService,
    private batchLifecycle: BatchLifecycleService,
    private auditService: AuditService,
    private events: EventsService,
    private notifications: NotificationService,
  ) {}

  async verify(
    deliveryId: string,
    input: ReceiptInput,
    oem: OemContext,
  ): Promise<PrintReceipt> {
    const delivery = await this.deliveryService.assertOemAccess(
      deliveryId,
      oem.oemId,
      oem.tenantId,
    );

    // Idempotent replay: an identical resubmission returns the stored result
    // without recomputing the hash or firing events a second time.
    const existing = await this.prisma.printReceipt.findFirst({
      where: {
        deliveryId,
        receiptHash: input.receiptHash,
        codeCount: input.codeCount,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && sameWatermarkSet(existing.watermarks, input.watermarks)) {
      return existing;
    }

    const manifest = await this.deliveryService.openManifestJson(delivery);
    const units = (manifest.units ?? []) as Array<{ tier2Code: string }>;
    const tier2Codes = units.map((u) => u.tier2Code);

    // The batch's watermark is the ground truth stored at mint time — rederiving it
    // here would need the tenant *slug*, but the manifest's `tenant` field is the
    // tenant id (E04's ManifestService.generate), so read the stored value instead.
    const batch = await this.prisma.batch.findUnique({
      where: { id: delivery.batchId },
      select: { watermark: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const expectedHash = receiptHash(tier2Codes);
    const expectedCount = tier2Codes.length;
    const expectedWatermark = batch.watermark;

    const { matched, mismatchReason, hashMatch, countMatch, watermarkMatch } =
      compareReceipt(input, {
        hash: expectedHash,
        count: expectedCount,
        watermark: expectedWatermark,
      });

    const created = await this.prisma.printReceipt.create({
      data: {
        tenantId: delivery.tenantId,
        batchId: delivery.batchId,
        deliveryId,
        oemUserId: oem.oemUserId,
        receiptHash: input.receiptHash,
        expectedHash,
        codeCount: input.codeCount,
        expectedCount,
        watermarks: input.watermarks,
        expectedWatermark,
        matched,
        mismatchReason,
        mismatchDetail: matched
          ? undefined
          : { hashMatch, countMatch, watermarkMatch },
      },
    });

    await this.auditService.record({
      tenantId: delivery.tenantId,
      actor: { type: 'oem', id: oem.oemUserId },
      action: 'batch.receipt',
      target: { type: 'batch', id: delivery.batchId },
      payload: { matched, mismatchReason, deliveryId },
    });

    if (matched) {
      await this.prisma.manifestDelivery.update({
        where: { id: deliveryId },
        data: { status: 'receipted' },
      });
      await this.batchLifecycle.transition(
        delivery.tenantId,
        delivery.batchId,
        'printed',
        { type: 'oem', id: oem.oemUserId },
      );
      await this.events.emit('batch.printed', {
        tenantId: delivery.tenantId,
        batchId: delivery.batchId,
        oemId: delivery.oemId,
        receiptId: created.id,
        codeCount: input.codeCount,
      });
    } else {
      await this.events.emit('receipt.mismatch', {
        tenantId: delivery.tenantId,
        batchId: delivery.batchId,
        oemId: delivery.oemId,
        deliveryId,
        reason: mismatchReason,
        detail: { hashMatch, countMatch, watermarkMatch },
      });
      await this.notifyMismatch(delivery, input, expectedCount);
    }

    return created;
  }

  private async notifyMismatch(
    delivery: { id: string; tenantId: string; batchId: string },
    input: ReceiptInput,
    expectedCount: number,
  ) {
    const env = loadEnv();
    const batch = await this.prisma.batch.findUniqueOrThrow({
      where: { id: delivery.batchId },
      include: { product: true, oem: true },
    });
    const owners = await this.prisma.membership.findMany({
      where: { tenantId: delivery.tenantId, role: 'owner' },
      include: { user: true },
    });

    for (const m of owners) {
      await this.notifications.send(
        'receipt.mismatch',
        { email: m.user.email },
        {
          oemName: batch.oem?.name ?? 'OEM',
          batchSku: batch.product.sku,
          expectedCount,
          receivedCount: input.codeCount,
          dashboardUrl: `${env.APP_BASE_URL}/deliveries/${delivery.id}`,
        },
        { tenantId: delivery.tenantId },
      );
    }
  }
}
