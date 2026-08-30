import { describe, expect, it, vi } from 'vitest';
import { UsageKind } from '@prisma/client';
import { MeteringService } from './metering.service';

describe('MeteringService.record', () => {
  it('writes a UsageEvent and emits usage.recorded', async () => {
    const created = {
      id: 'ue-1',
      tenantId: 'tenant-1',
      kind: UsageKind.scan_tier2,
      quantity: 1,
      occurredAt: new Date('2026-08-30T00:00:00.000Z'),
      ref: 'scan-1',
    };
    const create = vi.fn(async () => created);
    const emit = vi.fn(async () => {});
    const service = new MeteringService(
      { usageEvent: { create } } as never,
      { emit } as never,
    );

    await service.record({
      tenantId: 'tenant-1',
      kind: UsageKind.scan_tier2,
      quantity: 1,
      ref: 'scan-1',
      idempotencyKey: 'scan-1',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith('usage.recorded', {
      tenantId: 'tenant-1',
      usageEventId: 'ue-1',
      kind: UsageKind.scan_tier2,
      quantity: 1,
      occurredAt: created.occurredAt,
      ref: 'scan-1',
    });
  });

  it('is a silent no-op on a repeat idempotency key (P2002)', async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error('unique violation'), { code: 'P2002' });
    });
    const emit = vi.fn(async () => {});
    const service = new MeteringService(
      { usageEvent: { create } } as never,
      { emit } as never,
    );

    await expect(
      service.record({
        tenantId: 'tenant-1',
        kind: UsageKind.code_minted,
        quantity: 500,
        idempotencyKey: 'batch-1',
      }),
    ).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity before touching the database', async () => {
    const create = vi.fn();
    const service = new MeteringService(
      { usageEvent: { create } } as never,
      { emit: vi.fn() } as never,
    );

    await expect(
      service.record({ tenantId: 't', kind: UsageKind.api_call, quantity: 0 }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
