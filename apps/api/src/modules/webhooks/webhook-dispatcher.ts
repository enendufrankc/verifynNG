import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import type { WebhookEventName } from './event-catalogue.js';

/**
 * Fans a source domain event out to one `WebhookDelivery` row (+ BullMQ
 * `deliver` job) per tenant endpoint subscribed to it, per the event
 * catalogue in docs/epics/E16-public-api-webhooks.md. `scan.recorded` maps
 * to the external `scan.suspicious` event only for verdicts that indicate a
 * problem: suspicious/flagged always, and unknown only on a tier-2 scan
 * (an unrecognised code on tier-1 is just a bad-format code, not suspicious
 * activity) — see verdict-engine.spec.ts's "tier2 unknown" branch, which
 * confirms `unknown` (not a distinct "unknown-tier2" literal) is the verdict
 * string for that case.
 */
@Injectable()
export class WebhookDispatcher {
  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue('webhooks') private readonly webhooksQueue: Queue,
  ) {}

  @OnEvent('batch.minted')
  async onBatchMinted(event: {
    tenantId: string;
    batchId: string;
    productId: string;
    oemId?: string | null;
    count: number;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'batch.minted', {
      batchId: event.batchId,
      productId: event.productId,
      oemId: event.oemId ?? null,
      count: event.count,
    });
  }

  @OnEvent('scan.recorded')
  async onScanRecorded(event: {
    tenantId: string;
    scanEventId: string;
    unitId: string | null;
    batchId: string | null;
    tier: 1 | 2;
    verdict: string;
    geo: { country: string | null; city: string | null } | null;
    at: Date;
  }): Promise<void> {
    const isSuspicious =
      event.verdict === 'suspicious' ||
      event.verdict === 'flagged' ||
      (event.verdict === 'unknown' && event.tier === 2);
    if (!isSuspicious) return;

    await this.dispatch(event.tenantId, 'scan.suspicious', {
      scanEventId: event.scanEventId,
      unitId: event.unitId,
      batchId: event.batchId,
      tier: event.tier,
      verdict: event.verdict,
      geo: event.geo,
      at: event.at.toISOString(),
    });
  }

  @OnEvent('anomaly.detected')
  async onAnomalyDetected(event: {
    tenantId: string;
    anomalyId: string;
    rule: string;
    score: number;
    unitId?: string | null;
    batchId?: string | null;
    autoFlagged: boolean;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'anomaly.detected', {
      anomalyId: event.anomalyId,
      rule: event.rule,
      score: event.score,
      unitId: event.unitId ?? null,
      batchId: event.batchId ?? null,
      autoFlagged: event.autoFlagged,
    });
  }

  @OnEvent('unit.flagged')
  async onUnitFlagged(event: {
    tenantId: string;
    unitId: string;
    batchId: string;
    reason: string;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'unit.flagged', {
      unitId: event.unitId,
      batchId: event.batchId,
      reason: event.reason,
    });
  }

  @OnEvent('unit.decommissioned')
  async onUnitDecommissioned(event: {
    tenantId: string;
    unitId: string;
    batchId: string;
    reason: string;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'unit.decommissioned', {
      unitId: event.unitId,
      batchId: event.batchId,
      reason: event.reason,
    });
  }

  @OnEvent('report.created')
  async onReportCreated(event: {
    tenantId: string;
    reportId: string;
    reference: string;
    unitId: string;
    batchId: string;
    productId: string;
    verdictAtReport: string;
    purchaseChannel?: string | null;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'report.created', {
      reportId: event.reportId,
      reference: event.reference,
      unitId: event.unitId,
      batchId: event.batchId,
      productId: event.productId,
      verdictAtReport: event.verdictAtReport,
      purchaseChannel: event.purchaseChannel ?? null,
    });
  }

  @OnEvent('batch.printed')
  async onBatchPrinted(event: {
    tenantId: string;
    batchId: string;
    oemId: string;
    codeCount: number;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'batch.printed', {
      batchId: event.batchId,
      oemId: event.oemId,
      codeCount: event.codeCount,
    });
  }

  @OnEvent('batch.shipped')
  async onBatchShipped(event: {
    tenantId: string;
    batchId: string;
    oemId: string;
    shippedAt: Date;
    expectedArrivalAt?: Date | null;
  }): Promise<void> {
    await this.dispatch(event.tenantId, 'batch.shipped', {
      batchId: event.batchId,
      oemId: event.oemId,
      shippedAt: event.shippedAt.toISOString(),
      expectedArrivalAt: event.expectedArrivalAt?.toISOString() ?? null,
    });
  }

  private async dispatch(
    tenantId: string,
    eventName: WebhookEventName,
    data: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId, status: 'active' },
    });
    const subscribed = endpoints.filter(
      (e) => e.events.includes('*') || e.events.includes(eventName),
    );
    if (subscribed.length === 0) return;

    for (const endpoint of subscribed) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          tenantId,
          endpointId: endpoint.id,
          event: eventName,
          payload: data as Prisma.InputJsonValue,
        },
      });
      await this.webhooksQueue.add(
        'deliver',
        { deliveryId: delivery.id },
        { jobId: delivery.id },
      );
    }
  }
}
