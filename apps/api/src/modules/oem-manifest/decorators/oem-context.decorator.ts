import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import type { OemContext, OemScopedRequest } from '../guards/oem-scope.guard';

/** Extracts the OemScopeGuard-resolved { oemId, tenantId, oemUserId }. */
export const OemCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OemContext => {
    const request = ctx.switchToHttp().getRequest<OemScopedRequest>();
    if (!request.oem) {
      throw new InternalServerErrorException(
        'OemCtx decorator used on route without OemScopeGuard',
      );
    }
    return request.oem;
  },
);
