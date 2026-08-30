import { describe, expect, it, vi } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsageKind } from '@prisma/client';
import { MeteringSubscribers } from './metering.subscribers';
import type { MeterInput } from '../meter.port';

function setup() {
  const emitter = new EventEmitter2();
  const record = vi.fn(async (_input: MeterInput) => {});
  const subscribers = new MeteringSubscribers(emitter, { record });
  subscribers.onModuleInit();
  return { emitter, record };
}

describe('MeteringSubscribers', () => {
  it('meters batch.minted as code_minted with the batch as idempotency key', async () => {
    const { emitter, record } = setup();
    emitter.emit('batch.minted', {
      tenantId: 'tenant-1',
      batchId: 'batch-1',
      productId: 'product-1',
      count: 500,
      at: new Date('2026-08-30T00:00:00.000Z'),
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(record).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      kind: UsageKind.code_minted,
      quantity: 500,
      occurredAt: new Date('2026-08-30T00:00:00.000Z'),
      ref: 'batch-1',
      idempotencyKey: 'batch-1',
    });
  });

  it('meters every tier-1 scan regardless of verdict', async () => {
    const { emitter, record } = setup();
    emitter.emit('scan.recorded', {
      scanEventId: 'scan-1',
      tenantId: 'tenant-1',
      tier: 1,
      verdict: 'unknown',
      at: new Date('2026-08-30T00:00:00.000Z'),
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(record.mock.calls[0][0]).toMatchObject({
      kind: UsageKind.scan_tier1,
      quantity: 1,
    });
  });

  it.each([
    'authentic',
    'already-verified',
    'suspicious',
    'flagged',
    'decommissioned',
  ])('meters a billable tier-2 verdict: %s', async (verdict) => {
    const { emitter, record } = setup();
    emitter.emit('scan.recorded', {
      scanEventId: `scan-${verdict}`,
      tenantId: 'tenant-1',
      tier: 2,
      verdict,
      at: new Date(),
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: UsageKind.scan_tier2, quantity: 1 }),
    );
  });

  it.each(['invalid', 'unknown', 'rate-limited'])(
    'never meters a non-billable tier-2 verdict: %s',
    async (verdict) => {
      const { emitter, record } = setup();
      emitter.emit('scan.recorded', {
        scanEventId: `scan-${verdict}`,
        tenantId: 'tenant-1',
        tier: 2,
        verdict,
        at: new Date(),
      });
      // give the (synchronous) handler a tick to have run
      await new Promise((r) => setTimeout(r, 10));
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('meters notification.sent using the outbox id as the idempotency key', async () => {
    const { emitter, record } = setup();
    emitter.emit('notification.sent', {
      outboxId: 'outbox-1',
      tenantId: 'tenant-1',
      templateId: 'batch.minted',
      channel: 'email',
    });
    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(record).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      kind: UsageKind.notification_sent,
      quantity: 1,
      ref: 'outbox-1',
      idempotencyKey: 'outbox-1',
    });
  });
});
