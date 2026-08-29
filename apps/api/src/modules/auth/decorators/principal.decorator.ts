import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Principal as PrincipalType } from '../types/principal';

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PrincipalType | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  },
);
