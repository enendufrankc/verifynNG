import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedRequest } from '../../../common/authenticated-request';

export interface OemContext {
  oemId: string;
  tenantId: string;
  oemUserId: string;
}

export type OemScopedRequest = AuthenticatedRequest & { oem?: OemContext };

/**
 * Resolves the calling OEM user's OemUser row and attaches `req.oem`. Runs
 * after the global TenantContextGuard/RolesGuard, so `req.user` is already a
 * verified `role: 'oem'` principal by the time this executes.
 *
 * E02's JWT carries no `oemId` claim (see E05's cross-epic request note) — the
 * scope is resolved from the DB on every request instead, which is exactly
 * what the epic's own interface spec calls for.
 */
@Injectable()
export class OemScopeGuard implements CanActivate {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OemScopedRequest>();
    const userId = request.user?.userId;
    if (!userId) throw new ForbiddenException();

    const oemUser = await this.prisma.oemUser.findUnique({
      where: { userId },
    });
    if (!oemUser || oemUser.tenantId !== request.user?.tenantId) {
      throw new ForbiddenException();
    }

    request.oem = {
      oemId: oemUser.oemId,
      tenantId: oemUser.tenantId,
      oemUserId: oemUser.id,
    };
    return true;
  }
}
