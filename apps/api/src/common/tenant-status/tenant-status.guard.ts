import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { prisma } from '@verifynng/db';
import { PrincipalRequest } from '../principal';
import { ALLOW_SUSPENDED_KEY, TENANT_STATUS_KEY } from './decorators';
import { decidePolicyAcceptance } from './policy-acceptance';

export type TenantStatusDecision =
  | { allowed: true }
  | {
      allowed: false;
      error: 'tenant_not_active' | 'tenant_suspended' | 'tenant_offboarded';
    };

export function decideTenantStatus(
  status: string,
  method: string,
  required: string[] | undefined,
  allowSuspended: boolean,
  isExport = false,
): TenantStatusDecision {
  if (required?.includes(status)) return { allowed: true };
  if (status === 'offboarded')
    return method === 'GET' && isExport
      ? { allowed: true }
      : { allowed: false, error: 'tenant_offboarded' };
  if (status === 'suspended' || status === 'restricted') {
    if (allowSuspended || method === 'GET') return { allowed: true };
    return { allowed: false, error: 'tenant_suspended' };
  }
  if (status !== 'active' && method !== 'GET')
    return { allowed: false, error: 'tenant_not_active' };
  return { allowed: true };
}

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    if (req.path.startsWith('/policies/') || req.path.startsWith('/health'))
      return true;
    const routeTenantId =
      typeof req.params.tenantId === 'string' ? req.params.tenantId : undefined;
    const tenantId = routeTenantId ?? req.principal?.tenantId;
    if (!tenantId) return true;
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('tenant_not_found');
    if (
      routeTenantId &&
      req.principal?.tenantId &&
      routeTenantId !== req.principal.tenantId
    ) {
      throw new NotFoundException('tenant_not_found');
    }
    const allowed = this.reflector.get<string[]>(
      TENANT_STATUS_KEY,
      context.getHandler(),
    );
    const decision = decideTenantStatus(
      tenant.status,
      req.method,
      allowed,
      this.reflector.get<boolean>(ALLOW_SUSPENDED_KEY, context.getHandler()) ??
        false,
      req.path.endsWith('/export'),
    );
    if (!decision.allowed && decision.error === 'tenant_offboarded')
      throw new GoneException({ error: decision.error });
    if (!decision.allowed)
      throw new ForbiddenException({ error: decision.error });

    const isPolicyAcceptanceRoute = req.path.endsWith('/policies/accept');
    if (
      req.principal?.role === 'owner' &&
      req.method !== 'GET' &&
      !isPolicyAcceptanceRoute
    ) {
      const policies = await prisma.policyDocument.findMany({
        where: { kind: { in: ['aup', 'tos'] } },
        orderBy: { version: 'desc' },
      });
      const accepted = await prisma.policyAcceptance.findMany({
        where: { tenantId, userId: req.principal.userId },
        select: { kind: true, version: true },
      });
      const latest = new Map<string, string>();
      for (const policy of policies) {
        if (!latest.has(policy.kind)) latest.set(policy.kind, policy.version);
      }
      const pending = ['aup', 'tos'].filter((kind) => {
        const version = latest.get(kind);
        return (
          version !== undefined &&
          !accepted.some(
            (item) => item.kind === kind && item.version === version,
          )
        );
      });
      const policyDecision = decidePolicyAcceptance(
        req.principal.role,
        req.method,
        pending,
        isPolicyAcceptanceRoute,
      );
      if (!policyDecision.allowed)
        throw new ForbiddenException({
          error: policyDecision.error,
          pending: policyDecision.pending,
        });
    }
    return true;
  }
}
