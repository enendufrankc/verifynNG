import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

export interface Principal {
  userId: string;
  email?: string;
  tenantId?: string;
  role: string;
  platformRole?: string;
}

export type PrincipalRequest = Request & { principal?: Principal };

@Injectable()
export class PrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    req.principal = {
      userId: String(req.header('x-user-id') ?? 'development-user'),
      email: req.header('x-user-email') ?? undefined,
      tenantId: req.header('x-tenant-id') ?? undefined,
      role: req.header('x-role') ?? 'owner',
      platformRole: req.header('x-platform-role') ?? undefined,
    };
    return true;
  }
}
