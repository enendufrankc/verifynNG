import {
  Controller,
  UseFilters,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { ApiKeyGuard } from '../../api-keys/api-key.guard.js';
import { ScopesGuard } from '../guards/scopes.guard.js';
import { ApiErrorFilter } from '../filters/api-error.filter.js';
import { ApiVersionInterceptor } from '../interceptors/api-version.interceptor.js';
import { RateLimitInterceptor } from '../interceptors/rate-limit.interceptor.js';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor.js';

/**
 * Composes every cross-cutting concern shared by all `/api/v1/**` controllers:
 * `@Public()` (skips the global JWT guards — see ApiKeyGuard's own doc comment),
 * key + scope auth, per-key rate limiting, the E16 error envelope, and the
 * `ApiVersion` header.
 */
export function PublicApiController(path: string) {
  return applyDecorators(
    Controller(path),
    Public(),
    UseGuards(ApiKeyGuard, ScopesGuard),
    UseFilters(ApiErrorFilter),
    UseInterceptors(ApiVersionInterceptor, RateLimitInterceptor),
  );
}

/** Applies to a POST handler that requires an `Idempotency-Key` header (T3). */
export function Idempotent() {
  return applyDecorators(UseInterceptors(IdempotencyInterceptor));
}
