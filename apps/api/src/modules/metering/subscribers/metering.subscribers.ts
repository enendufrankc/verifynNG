import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { METER_PORT, UsageKind } from '../meter.port';
import type { MeterPort } from '../meter.port';

// Tier-2 verdicts that represent real registry lookups a tenant is served
// for. `invalid|unknown|rate-limited` are excluded so a tenant is never
// charged for an attacker probing their namespace. Tier-1 scans are always
// billable regardless of verdict — see docs/analytics-and-metering.md.
const BILLABLE_TIER2_VERDICTS = new Set([
  'authentic',
  'already-verified',
  'suspicious',
  'flagged',
  'decommissioned',
]);

interface BatchMintedEvent {
  tenantId: string;
  batchId: string;
  productId?: string;
  oemId?: string;
  count: number;
  watermark?: string;
  kid?: string;
  at: string | Date;
}

interface ScanRecordedEvent {
  scanEventId: string;
  tenantId: string;
  unitId?: string | null;
  batchId?: string | null;
  tier: 1 | 2;
  verdict: string;
  ipHash?: string | null;
  geo?: unknown;
  src?: string;
  at: string | Date;
}

interface NotificationSentEvent {
  outboxId: string;
  tenantId: string;
  templateId: string;
  channel: string;
  recipientHash?: string;
  providerMessageId?: string;
}

interface ApiCallEvent {
  tenantId: string;
  apiKeyId: string;
  route: string;
  at?: string | Date;
}

/**
 * Subscribes to upstream domain events and turns billable-shaped ones into
 * UsageEvents. Registered with EventEmitter2.on(...) in onModuleInit — the
 * same pattern as notifications' EventRouter — rather than `@OnEvent`, which
 * nothing else in this codebase uses.
 */
@Injectable()
export class MeteringSubscribers implements OnModuleInit {
  private readonly logger = new Logger(MeteringSubscribers.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(METER_PORT) private readonly meter: MeterPort,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on('batch.minted', (payload: BatchMintedEvent) =>
      this.onBatchMinted(payload).catch((err) =>
        this.logError('batch.minted', err),
      ),
    );
    this.eventEmitter.on('scan.recorded', (payload: ScanRecordedEvent) =>
      this.onScanRecorded(payload).catch((err) =>
        this.logError('scan.recorded', err),
      ),
    );
    this.eventEmitter.on(
      'notification.sent',
      (payload: NotificationSentEvent) =>
        this.onNotificationSent(payload).catch((err) =>
          this.logError('notification.sent', err),
        ),
    );
    // Dormant: E16 hasn't shipped API-key auth yet, so this never fires today.
    this.eventEmitter.on('api.call', (payload: ApiCallEvent) =>
      this.onApiCall(payload).catch((err) => this.logError('api.call', err)),
    );
  }

  private async onBatchMinted(payload: BatchMintedEvent): Promise<void> {
    await this.meter.record({
      tenantId: payload.tenantId,
      kind: UsageKind.code_minted,
      quantity: payload.count,
      occurredAt: new Date(payload.at),
      ref: payload.batchId,
      idempotencyKey: payload.batchId,
    });
  }

  private async onScanRecorded(payload: ScanRecordedEvent): Promise<void> {
    if (payload.tier === 1) {
      await this.meter.record({
        tenantId: payload.tenantId,
        kind: UsageKind.scan_tier1,
        quantity: 1,
        occurredAt: new Date(payload.at),
        ref: payload.scanEventId,
        idempotencyKey: payload.scanEventId,
      });
      return;
    }
    if (!BILLABLE_TIER2_VERDICTS.has(payload.verdict)) return;
    await this.meter.record({
      tenantId: payload.tenantId,
      kind: UsageKind.scan_tier2,
      quantity: 1,
      occurredAt: new Date(payload.at),
      ref: payload.scanEventId,
      idempotencyKey: payload.scanEventId,
    });
  }

  private async onNotificationSent(
    payload: NotificationSentEvent,
  ): Promise<void> {
    await this.meter.record({
      tenantId: payload.tenantId,
      kind: UsageKind.notification_sent,
      quantity: 1,
      ref: payload.outboxId,
      idempotencyKey: payload.outboxId,
    });
  }

  private async onApiCall(payload: ApiCallEvent): Promise<void> {
    await this.meter.record({
      tenantId: payload.tenantId,
      kind: UsageKind.api_call,
      quantity: 1,
      occurredAt: payload.at ? new Date(payload.at) : undefined,
      ref: payload.apiKeyId,
    });
  }

  private logError(event: string, err: unknown): void {
    this.logger.error(
      `metering subscriber failed for ${event}`,
      err instanceof Error ? err.stack : String(err),
    );
  }
}
