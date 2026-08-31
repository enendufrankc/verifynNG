import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, type TenantMfaPolicy } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';

export interface SetMfaPolicyDto {
  requiredRoles: string[];
  gracePeriodDays: number;
}

export interface MfaEvaluation {
  required: boolean;
  /** Set only when `required` is true and the user has not enrolled TOTP yet. */
  inGraceUntil?: Date;
}

@Injectable()
export class MfaPolicyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  async get(tenantId: string): Promise<TenantMfaPolicy | null> {
    return this.prisma.tenantMfaPolicy.findUnique({ where: { tenantId } });
  }

  async set(
    tenantId: string,
    dto: SetMfaPolicyDto,
    actorId: string | undefined,
    actorIp: string | undefined,
  ): Promise<TenantMfaPolicy> {
    const existing = await this.get(tenantId);
    // enforcedFrom is set once, the first time the policy becomes non-empty —
    // it anchors every member's grace window, so a later edit (e.g. adding a
    // role, or changing the grace length) must not reset already-running clocks.
    const becomesNonEmpty =
      dto.requiredRoles.length > 0 &&
      (!existing || existing.requiredRoles.length === 0);

    const saved = await this.prisma.tenantMfaPolicy.upsert({
      where: { tenantId },
      create: {
        tenantId,
        requiredRoles: dto.requiredRoles,
        gracePeriodDays: dto.gracePeriodDays,
        enforcedFrom: new Date(),
      },
      update: {
        requiredRoles: dto.requiredRoles,
        gracePeriodDays: dto.gracePeriodDays,
        ...(becomesNonEmpty ? { enforcedFrom: new Date() } : {}),
      },
    });

    await this.auditService.record({
      tenantId,
      actor: { type: actorId ? 'user' : 'system', id: actorId, ip: actorIp },
      action: 'mfa.policy.changed',
      target: { type: 'tenant', id: tenantId },
      payload: {
        requiredRoles: dto.requiredRoles,
        gracePeriodDays: dto.gracePeriodDays,
      },
    });
    this.eventEmitter.emit('mfa.policy.changed', {
      tenantId,
      actorId,
      requiredRoles: dto.requiredRoles,
      gracePeriodDays: dto.gracePeriodDays,
    });

    return saved;
  }

  /** Members not yet enrolled, for the settings screen's "affected members" list (T10). */
  async listUnenrolledAffected(
    tenantId: string,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      role: string;
      daysRemaining: number;
    }>
  > {
    const policy = await this.get(tenantId);
    if (!policy || policy.requiredRoles.length === 0) return [];

    const graceUntil = this.graceDeadline(policy);
    const daysRemaining = Math.max(
      0,
      Math.ceil((graceUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );

    const memberships = await this.prisma.membership.findMany({
      where: { tenantId, role: { in: policy.requiredRoles as never[] } },
      include: { user: true },
    });
    return memberships
      .filter((m) => !m.user.mfaEnabled)
      .map((m) => ({
        userId: m.userId,
        email: m.user.email,
        role: m.role,
        daysRemaining,
      }));
  }

  async evaluate(
    userId: string,
    tenantId: string,
    role: string,
  ): Promise<MfaEvaluation> {
    const policy = await this.get(tenantId);
    if (!policy || !policy.requiredRoles.includes(role)) {
      return { required: false };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.mfaEnabled) {
      // Already enrolled — AuthService's native `mfaEnabled` check already
      // forces the TOTP challenge; nothing extra for the hook to add.
      return { required: true };
    }

    return { required: true, inGraceUntil: this.graceDeadline(policy) };
  }

  private graceDeadline(policy: TenantMfaPolicy): Date {
    const deadline = new Date(policy.enforcedFrom);
    deadline.setDate(deadline.getDate() + policy.gracePeriodDays);
    return deadline;
  }
}
