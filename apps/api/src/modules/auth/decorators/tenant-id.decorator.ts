import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Extracts the server-derived tenantId from the request.
 * Throws 500 if used on a route without tenant context (never silently undefined).
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.tenantId) {
      throw new InternalServerErrorException(
        'TenantId decorator used on route without tenant context',
      );
    }
    return request.tenantId;
  },
);
