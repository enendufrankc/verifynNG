import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import Redis from 'ioredis';
import { randomUUID, createHash } from 'node:crypto';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { canonicalize } from '@verifynng/core';
import { IdempotencyInterceptor } from '../../src/modules/public-api/interceptors/idempotency.interceptor';
import { IdempotencyMismatchException } from '../../src/modules/public-api/errors/idempotency-mismatch.exception';

function fakeContext(opts: {
  tenantId: string;
  idempotencyKey?: string;
  body?: unknown;
}): ExecutionContext {
  const req = {
    apiKey: {
      tenantId: opts.tenantId,
      keyId: 'key-1',
      scopes: [],
      mode: 'live',
    },
    headers: opts.idempotencyKey
      ? { 'idempotency-key': opts.idempotencyKey }
      : {},
    body: opts.body,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

function handlerThrowing(err: unknown): CallHandler {
  return { handle: () => throwError(() => err) };
}

describe('IdempotencyInterceptor (integration, real Redis)', () => {
  let redis: Redis;
  let interceptor: IdempotencyInterceptor;
  const runId = Date.now();

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL!);
    interceptor = new IdempotencyInterceptor(redis);
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('rejects a POST with no Idempotency-Key header', async () => {
    const ctx = fakeContext({ tenantId: `t-${runId}-1`, body: { count: 1 } });
    await expect(
      interceptor.intercept(ctx, handlerReturning({ ok: true })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('runs the handler once and replays the identical response for a repeated key + body', async () => {
    const tenantId = `t-${runId}-2`;
    const idemKey = randomUUID();
    let calls = 0;
    const handler: CallHandler = {
      handle: () => {
        calls += 1;
        return of({ receivedAt: calls });
      },
    };

    const ctx = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 1 },
    });
    const first$ = await interceptor.intercept(ctx, handler);
    const first = await firstValueFrom(first$);

    const second$ = await interceptor.intercept(ctx, handler);
    const second = await firstValueFrom(second$);

    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it('throws idempotency_mismatch when the same key is replayed with a different body', async () => {
    const tenantId = `t-${runId}-3`;
    const idemKey = randomUUID();

    const ctx1 = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 1 },
    });
    const obs1 = await interceptor.intercept(
      ctx1,
      handlerReturning({ ok: true }),
    );
    await firstValueFrom(obs1);

    const ctx2 = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 2 },
    });
    await expect(
      interceptor.intercept(ctx2, handlerReturning({ ok: true })),
    ).rejects.toBeInstanceOf(IdempotencyMismatchException);
  });

  it('clears the lock on handler failure so a retry with the same key can succeed', async () => {
    const tenantId = `t-${runId}-4`;
    const idemKey = randomUUID();

    const ctxFail = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 1 },
    });
    const failing$ = await interceptor.intercept(
      ctxFail,
      handlerThrowing(new Error('boom')),
    );
    await expect(firstValueFrom(failing$)).rejects.toThrow('boom');

    const ctxRetry = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 1 },
    });
    const retry$ = await interceptor.intercept(
      ctxRetry,
      handlerReturning({ ok: true }),
    );
    await expect(firstValueFrom(retry$)).resolves.toEqual({ ok: true });
  });

  it('409s a concurrent request holding the same in-flight lock', async () => {
    const tenantId = `t-${runId}-5`;
    const idemKey = randomUUID();

    // Claim the lock directly, simulating a first request still in flight.
    const bodyHash = createHash('sha256')
      .update(canonicalize({ count: 1 }))
      .digest('hex');
    await redis.set(
      `idem:${tenantId}:${idemKey}`,
      JSON.stringify({ bodyHash, inFlight: true }),
      'EX',
      30,
      'NX',
    );

    const ctx = fakeContext({
      tenantId,
      idempotencyKey: idemKey,
      body: { count: 1 },
    });
    await expect(
      interceptor.intercept(ctx, handlerReturning({ ok: true })),
    ).rejects.toMatchObject({ status: 409 });
  });
});
