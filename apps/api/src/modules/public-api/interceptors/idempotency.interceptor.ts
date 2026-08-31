import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import Redis from 'ioredis';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import crypto from 'node:crypto';
import { canonicalize } from '@verifynng/core';
import { IdempotencyMismatchException } from '../errors/idempotency-mismatch.exception.js';
import {
  IDEMPOTENCY_LOCK_TTL_SECONDS,
  IDEMPOTENCY_TTL_SECONDS,
} from '../constants.js';

interface IdempotencyRecord {
  bodyHash: string;
  inFlight: boolean;
  body?: unknown;
}

/**
 * `Idempotency-Key` for POSTs (T3). Missing header → 400 validation. Same
 * key + same body → replays the stored response without re-running the
 * handler (the response status is whatever the route's own `@HttpCode()`
 * says — identical on replay since it's the same route every time, so
 * there's no need to persist/restore a status code separately). Same key +
 * different body → 409 idempotency_mismatch. Concurrent request with the
 * same key while the first is still running → 409 (in-flight).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.apiKey!;

    const header = request.headers['idempotency-key'];
    if (typeof header !== 'string' || header.length === 0) {
      throw new BadRequestException({
        type: 'validation',
        message: 'Idempotency-Key header is required',
        details: [{ field: 'Idempotency-Key', issue: 'required' }],
      });
    }

    const bodyHash = crypto
      .createHash('sha256')
      .update(canonicalize(request.body ?? {}))
      .digest('hex');
    const redisKey = `idem:${apiKey.tenantId}:${header}`;

    const existingRaw = await this.redis.get(redisKey);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as IdempotencyRecord;
      if (existing.bodyHash !== bodyHash) {
        throw new IdempotencyMismatchException();
      }
      if (existing.inFlight) {
        throw new ConflictException(
          'A request with this Idempotency-Key is already in flight',
        );
      }
      return of(existing.body);
    }

    const claimed = await this.redis.set(
      redisKey,
      JSON.stringify({ bodyHash, inFlight: true } satisfies IdempotencyRecord),
      'EX',
      IDEMPOTENCY_LOCK_TTL_SECONDS,
      'NX',
    );
    if (!claimed) {
      throw new ConflictException(
        'A request with this Idempotency-Key is already in flight',
      );
    }

    return next.handle().pipe(
      tap((body) => {
        void this.redis.set(
          redisKey,
          JSON.stringify({
            bodyHash,
            inFlight: false,
            body,
          } satisfies IdempotencyRecord),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
      }),
      catchError((err) => {
        void this.redis.del(redisKey);
        return throwError(() => err);
      }),
    );
  }
}
