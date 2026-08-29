import { describe, expect, it, vi } from 'vitest';
import { MintService } from './mint.service';

describe('MintService idempotency', () => {
  it('returns the existing batch without minting again', async () => {
    const existing = {
      id: 'batch-1',
      tenantId: 'tenant-1',
      productId: 'product-1',
      oemId: 'oem-1',
      count: 500,
      jobId: null,
    };
    const prisma = {
      batch: { findUnique: async () => existing },
    } as never;
    const service = new MintService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.mint({
      tenantId: 'tenant-1',
      productId: 'product-1',
      oemId: 'oem-1',
      count: 500,
      idempotencyKey: 'same-key',
      requestedBy: 'owner-1',
    });

    expect(result).toMatchObject({
      batch: existing,
      mode: 'sync',
      existing: true,
    });
  });
});

describe('MintService collision retry', () => {
  it('regenerates the chunk after a unique collision instead of dropping a unit', async () => {
    const batch = {
      id: 'batch-1',
      tenantId: 'tenant-1',
      productId: 'product-1',
      oemId: 'oem-1',
      count: 1,
      jobId: null,
    };
    let createManyAttempts = 0;
    const createMany = vi.fn(async (_args: { data: unknown[] }) => {
      createManyAttempts += 1;
      if (createManyAttempts === 1) {
        throw Object.assign(new Error('unique collision'), { code: 'P2002' });
      }
    });
    const prisma = {
      batch: {
        findUnique: async () => null,
        create: async () => batch,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...batch,
          ...data,
        }),
      },
      unit: { count: async () => 0 },
      product: { findFirst: async () => ({ id: 'product-1' }) },
      oem: { findFirst: async () => ({ id: 'oem-1' }) },
      $transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({ unit: { createMany } }),
    } as never;
    const service = new MintService(
      prisma,
      { canMint: async () => ({ allowed: true }) } as never,
      {
        generate: async () => ({ objectKey: 'manifest', sha256: 'hash' }),
      } as never,
      { emit: async () => undefined } as never,
      { add: async () => ({ id: 'job-1' }) } as never,
      { add: async () => ({ id: 'export-job-1' }) } as never,
    );

    await service.mint({
      tenantId: 'tenant-1',
      productId: 'product-1',
      oemId: 'oem-1',
      count: 1,
      idempotencyKey: 'collision-key',
      requestedBy: 'owner-1',
    });

    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(createMany.mock.calls[1][0].data).toHaveLength(1);
    expect(createMany.mock.calls[1][0].data[0]).not.toEqual(
      createMany.mock.calls[0][0].data[0],
    );
  });
});
