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

/**
 * Composes every cross-cutting concern shared by all `/api/v1/**` controllers:
 * `@Public()` (skips the global JWT guards — see ApiKeyGuard's own doc comment),
 * key + scope auth, the E16 error envelope, and the `ApiVersion` header.
 */
export function PublicApiController(path: string) {
  return applyDecorators(
    Controller(path),
    Public(),
    UseGuards(ApiKeyGuard, ScopesGuard),
    UseFilters(ApiErrorFilter),
    UseInterceptors(ApiVersionInterceptor),
  );
}
