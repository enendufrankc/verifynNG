import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, ImpersonationMode } from '@prisma/client';
import { TokenService } from '../../auth/services/token.service';
import { NotificationService } from '../../notifications/notifications.service';

export const IMPERSONATION_EXPIRE_QUEUE = 'support-impersonation';

export interface StartImpersonationResult {
  id: string;
  token: string;
  expiresAt: string;
  mode: ImpersonationMode;
  tenantId: string;
}

/** What ImpersonationGuard resolves and attaches to every impersonated request. */
export interface ActiveImpersonation {
  id: string;
  supportUserId: string;
  supportEmail: string;
  tenantId: string;
  mode: ImpersonationMode;
}

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationService,
    @InjectQueue(IMPERSONATION_EXPIRE_QUEUE) private readonly queue: Queue,
  ) {}

  private ttlSeconds(): number {
    return this.config.get<number>('SUPPORT_IMPERSONATION_TTL_SECONDS', 1800);
  }

  async start(
    supportUserId: string,
    tenantId: string,
    opts: { mode: ImpersonationMode; reason?: string },
    meta: { userAgent?: string; ipPrefix?: string } = {},
  ): Promise<StartImpersonationResult> {
    if (opts.mode === 'write' && (opts.reason?.trim().length ?? 0) < 20) {
      throw new BadRequestException({
        error: 'reason_required',
        message: 'A reason of at least 20 characters is required to write.',
      });
    }

    const [tenant, supportUser] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.user.findUnique({ where: { id: supportUserId } }),
    ]);
    if (!tenant) throw new NotFoundException('tenant_not_found');
    if (!supportUser) throw new NotFoundException('support_user_not_found');

    // Only one active impersonation per (support user, tenant) at a time —
    // starting a new one (e.g. elevating read → write) supersedes the last.
    await this.endActiveFor(supportUserId, tenantId, 'user');

    // Never `owner` — see epic Notes: billing/member management/SSO config
    // stay off-limits even in write mode.
    const role = opts.mode === 'write' ? 'operator' : 'viewer';
    const refreshToken = this.tokenService.generateRefreshToken();
    const session = await this.tokenService.createSession(
      supportUserId,
      tenantId,
      refreshToken,
      meta.userAgent,
      meta.ipPrefix,
    );
    const token = await this.tokenService.issueAccessToken({
      userId: supportUserId,
      tenantId,
      role,
      platformRole: 'support',
      sessionId: session.id,
    });

    const ttlSeconds = this.ttlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const record = await this.prisma.impersonationSession.create({
      data: {
        supportUserId,
        tenantId,
        mode: opts.mode,
        reason: opts.reason,
        sessionId: session.id,
        expiresAt,
      },
    });

    await this.queue.add(
      'expire',
      { impersonationSessionId: record.id },
      { delay: ttlSeconds * 1000, jobId: record.id },
    );

    this.eventEmitter.emit('impersonation.started', {
      sessionId: record.id,
      supportUserId,
      tenantId,
      mode: opts.mode,
      reason: opts.reason,
      expiresAt: expiresAt.toISOString(),
    });

    if (tenant.notifyOnImpersonation) {
      const owner = await this.prisma.membership.findFirst({
        where: { tenantId, role: 'owner' },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (owner?.user.email) {
        await this.notifications.send(
          'impersonation.started',
          { email: owner.user.email },
          {
            tenantName: tenant.name,
            mode: opts.mode,
            startedAt: record.startedAt.toISOString(),
          },
          { tenantId },
        );
      }
    }

    return {
      id: record.id,
      token,
      expiresAt: expiresAt.toISOString(),
      mode: opts.mode,
      tenantId,
    };
  }

  /** Ends every still-active session for a (support user, tenant) pair. */
  private async endActiveFor(
    supportUserId: string,
    tenantId: string,
    endedBy: 'user' | 'expiry' | 'revoked',
  ) {
    const active = await this.prisma.impersonationSession.findMany({
      where: { supportUserId, tenantId, endedAt: null },
    });
    for (const session of active) {
      await this.end(session.id, endedBy);
    }
  }

  async end(
    impersonationSessionId: string,
    endedBy: 'user' | 'expiry' | 'revoked' = 'user',
  ): Promise<void> {
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: impersonationSessionId },
    });
    if (!session || session.endedAt) return;

    const endedAt = new Date();
    await this.prisma.impersonationSession.update({
      where: { id: impersonationSessionId },
      data: { endedAt, endedBy },
    });
    await this.tokenService.revokeSession(
      session.supportUserId,
      session.sessionId,
      `impersonation-${endedBy}`,
    );
    await this.queue.remove(impersonationSessionId).catch(() => undefined);

    this.eventEmitter.emit('impersonation.ended', {
      sessionId: session.id,
      supportUserId: session.supportUserId,
      tenantId: session.tenantId,
      endedBy,
      durationSeconds: Math.round(
        (endedAt.getTime() - session.startedAt.getTime()) / 1000,
      ),
    });
  }

  /** Called by a support user to end their own session (banner "End session"). */
  async endAsUser(supportUserId: string, impersonationSessionId: string) {
    const session = await this.prisma.impersonationSession.findUnique({
      where: { id: impersonationSessionId },
    });
    if (!session) throw new NotFoundException('impersonation_not_found');
    if (session.supportUserId !== supportUserId) throw new ForbiddenException();
    await this.end(impersonationSessionId, 'user');
  }

  async active(supportUserId: string) {
    return this.prisma.impersonationSession.findMany({
      where: { supportUserId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** History across all support users — `app/(support)/impersonation` list. */
  async history(filter: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(filter.limit ?? 50, 200);
    const items = await this.prisma.impersonationSession.findMany({
      orderBy: { startedAt: 'desc' },
      cursor: filter.cursor ? { id: filter.cursor } : undefined,
      skip: filter.cursor ? 1 : 0,
      take: limit + 1,
    });
    let cursor: string | undefined;
    if (items.length > limit) cursor = items.pop()!.id;
    return { items, cursor };
  }

  /** Resolved by ImpersonationGuard on every tenant-scoped support request. */
  async resolveActiveFor(
    supportUserId: string,
    tenantId: string,
  ): Promise<ActiveImpersonation | null> {
    const session = await this.prisma.impersonationSession.findFirst({
      where: { supportUserId, tenantId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) return null;

    if (session.expiresAt <= new Date()) {
      await this.end(session.id, 'expiry');
      return null;
    }

    const supportUser = await this.prisma.user.findUnique({
      where: { id: supportUserId },
      select: { email: true },
    });
    return {
      id: session.id,
      supportUserId,
      supportEmail: supportUser?.email ?? supportUserId,
      tenantId,
      mode: session.mode,
    };
  }
}
