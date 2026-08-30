import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { BatchStatus } from '@prisma/client';
import { BatchLifecycleService } from './batch-lifecycle.service';

const ALL_STATUSES: BatchStatus[] = [
  'minting',
  'minted',
  'delivered',
  'printed',
  'shipped',
  'closed',
  'failed',
];

const LEGAL_PAIRS: Array<[BatchStatus, BatchStatus]> = [
  ['minted', 'delivered'],
  ['delivered', 'printed'],
  ['printed', 'shipped'],
  ['minted', 'closed'],
  ['delivered', 'closed'],
  ['printed', 'closed'],
  ['shipped', 'closed'],
];

describe('BatchLifecycleService.canTransition', () => {
  const prisma = {} as never;
  const events = { emit: vi.fn() } as never;
  const service = new BatchLifecycleService(prisma, events);

  it('allows every documented legal transition', () => {
    for (const [from, to] of LEGAL_PAIRS) {
      expect(service.canTransition(from, to)).toBe(true);
    }
  });

  it('rejects every other (from, to) pair', () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const isLegal = LEGAL_PAIRS.some(([f, t]) => f === from && t === to);
        expect(service.canTransition(from, to)).toBe(isLegal);
      }
    }
  });
});

describe('BatchLifecycleService.transition', () => {
  let prisma: {
    batch: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let events: { emit: ReturnType<typeof vi.fn> };
  let service: BatchLifecycleService;

  beforeEach(() => {
    prisma = {
      batch: { findFirst: vi.fn(), update: vi.fn() },
    };
    events = { emit: vi.fn() };
    service = new BatchLifecycleService(prisma as never, events as never);
  });

  it('throws NotFoundException for a batch outside the tenant', async () => {
    prisma.batch.findFirst.mockResolvedValue(null);
    await expect(
      service.transition('tenant-a', 'batch-1', 'delivered', { type: 'user' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ConflictException with from/to on an illegal transition', async () => {
    prisma.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'shipped',
    });
    await expect(
      service.transition('tenant-a', 'batch-1', 'shipped', { type: 'oem' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'illegal_transition',
        from: 'shipped',
        to: 'shipped',
      }),
    });
    expect(prisma.batch.update).not.toHaveBeenCalled();
  });

  it('persists the new status, merges extra columns, and emits batch.status.changed', async () => {
    prisma.batch.findFirst.mockResolvedValue({
      id: 'batch-1',
      status: 'minted',
    });
    prisma.batch.update.mockResolvedValue({
      id: 'batch-1',
      status: 'delivered',
    });

    const shipDate = new Date('2026-09-15');
    const result = await service.transition(
      'tenant-a',
      'batch-1',
      'delivered',
      { type: 'user', id: 'user-1' },
      { expectedShipDate: shipDate },
    );

    expect(prisma.batch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { expectedShipDate: shipDate, status: 'delivered' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'batch.status.changed',
      expect.objectContaining({
        tenantId: 'tenant-a',
        batchId: 'batch-1',
        from: 'minted',
        to: 'delivered',
      }),
    );
    expect(result).toEqual({ id: 'batch-1', status: 'delivered' });
  });
});
