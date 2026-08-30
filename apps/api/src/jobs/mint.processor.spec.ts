import { describe, expect, it, vi } from 'vitest';

vi.mock('@verifynng/config', () => ({
  loadEnv: () => ({
    MINT_CHUNK: 2,
    CORE_KEYS:
      'k1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    CORE_ACTIVE_KID: 'k1',
  }),
}));

import { MintProcessor } from './mint.processor';

function processor(prisma: unknown) {
  return new MintProcessor(
    prisma as never,
    {
      generate: async () => ({ objectKey: 'manifest', sha256: 'hash' }),
    } as never,
    { emit: async () => undefined } as never,
    { add: async () => ({ id: 'export-job-1' }) } as never,
  );
}

describe('MintProcessor resume', () => {
  it('resumes from lastChunk instead of re-minting completed chunks', async () => {
    const batch = {
      id: 'batch-1',
      tenantId: 'tenant-1',
      productId: 'product-1',
      oemId: 'oem-1',
      status: 'minting',
      watermark: 'ABCD',
      lastChunk: 1, // chunk 0 (serials 1-2) already written before the crash
    };
    const createMany = vi.fn(async (_args: { data: unknown[] }) => undefined);
    const prisma = {
      tenant: { findUniqueOrThrow: async () => ({ slug: 'tenant-1' }) },
      batch: {
        findUnique: async () => batch,
        update: async ({ data }: { data: Record<string, unknown> }) => ({
          ...batch,
          ...data,
        }),
      },
      $transaction: async (work: (tx: unknown) => Promise<void>) =>
        work({ unit: { createMany } }),
    };

    const job = {
      data: { tenantId: 'tenant-1', batchId: 'batch-1', count: 5 },
      updateProgress: vi.fn(async () => undefined),
    } as never;

    await processor(prisma).process(job);

    // chunkSize=2, count=5, lastChunk=1 → resumes at serial 3: chunk (3,4) then (5)
    expect(createMany).toHaveBeenCalledTimes(2);
    expect(createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(createMany.mock.calls[1][0].data).toHaveLength(1);
  });
});

describe('MintProcessor failure handling', () => {
  it('marks the batch failed with the error reason on job failure', async () => {
    const update = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => data,
    );
    const prisma = { batch: { update } };

    await processor(prisma).onFailed(
      { data: { tenantId: 'tenant-1', batchId: 'batch-1', count: 3 } } as never,
      new Error('boom'),
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: { status: 'failed', failedReason: 'boom' },
    });
  });

  it('does nothing when the job has no batchId', async () => {
    const update = vi.fn();
    const prisma = { batch: { update } };

    await processor(prisma).onFailed(undefined, new Error('boom'));

    expect(update).not.toHaveBeenCalled();
  });
});
