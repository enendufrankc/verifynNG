import { describe, expect, it } from 'vitest';
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
