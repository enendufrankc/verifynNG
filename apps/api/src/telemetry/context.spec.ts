import { describe, it, expect } from 'vitest';
import { getContext, runWithContext, withJobContext } from './context';

describe('RequestContext', () => {
  it('returns undefined when no context active', () => {
    expect(getContext()).toBeUndefined();
  });

  it('propagates context across async boundaries', async () => {
    const ctx = { requestId: 'req-123', tenantId: 'tenant-abc' };

    await runWithContext(ctx, async () => {
      expect(getContext()).toEqual(ctx);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(getContext()).toEqual(ctx);
    });

    expect(getContext()).toBeUndefined();
  });

  it('withJobContext extracts context from BullMQ job data', async () => {
    const job = {
      id: 'job-99',
      name: 'statusRoll',
      data: { requestId: 'req-job-1', tenantId: 'tenant-job' },
    };

    await withJobContext(job, async () => {
      expect(getContext()).toEqual({
        requestId: 'req-job-1',
        tenantId: 'tenant-job',
        userId: undefined,
        traceId: undefined,
      });
    });
  });
});
