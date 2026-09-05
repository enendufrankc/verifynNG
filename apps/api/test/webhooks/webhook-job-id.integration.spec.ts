import { describe, it, expect, afterAll } from 'vitest';
import { Queue } from 'bullmq';

/**
 * Regression guard for a real bug: BullMQ's `Job.validateOptions` rejects a
 * custom jobId containing ':' unless it splits into exactly 3 segments
 * (legacy repeatable-job compatibility) — `Queue.add()` throws "Custom Id
 * cannot contain :" synchronously. The webhook retry/redeliver jobIds used
 * to be `${id}:${attempt}` (2 segments) — always invalid, so no delivery
 * could ever retry automatically against a real Redis. Mocked-queue unit
 * tests never caught this since they never call BullMQ's real validation.
 * This test exercises the actual formats against a real BullMQ Queue.
 */
describe('webhook BullMQ jobId formats (regression)', () => {
  const url = new URL(process.env.REDIS_URL!);
  const connection = {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
  };
  const queue = new Queue('webhook-jobid-regression-test', { connection });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('accepts the dispatch/test-send jobId format (bare delivery id)', async () => {
    const job = await queue.add(
      'deliver',
      {},
      { jobId: 'cly3k9q4x0001abcd1234efgh' },
    );
    expect(job.id).toBe('cly3k9q4x0001abcd1234efgh');
  });

  it('accepts the retry jobId format (delivery id, non-colon separator)', async () => {
    const job = await queue.add(
      'deliver',
      {},
      { jobId: 'cly3k9q4x0001abcd1234efgh-attempt-2', delay: 60_000 },
    );
    expect(job.id).toBe('cly3k9q4x0001abcd1234efgh-attempt-2');
  });

  it('accepts the redeliver jobId format (delivery id, non-colon separator + timestamp)', async () => {
    const job = await queue.add(
      'deliver',
      {},
      { jobId: `cly3k9q4x0001abcd1234efgh-redeliver-${Date.now()}` },
    );
    expect(job.id).toBeTruthy();
  });

  it('documents the exact BullMQ rule this guards against', async () => {
    await expect(
      queue.add('deliver', {}, { jobId: 'cly3k9q4x0001abcd1234efgh:2' }),
    ).rejects.toThrow('Custom Id cannot contain :');
  });
});
