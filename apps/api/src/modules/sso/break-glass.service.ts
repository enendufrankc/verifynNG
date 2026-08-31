import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { PasswordService } from '../auth/services/password.service';
import { TokenService } from '../auth/services/token.service';
import { MfaService } from '../auth/services/mfa.service';
import { toSafeUser } from '../auth/utils/safe-user';
import { AuditService } from '../audit/audit.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service';

const BREAK_GLASS_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class BreakGlassService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordService: PasswordService,
    private readonly mfaService: MfaService,
    private readonly tokenService: TokenService,
    private readonly rateLimitService: RateLimitService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async attempt(
    tenantSlug: string,
    email: string,
    password: string,
    totp: string,
    ip: string | undefined,
  ) {
    const rateLimitKey = `sso:break-glass:${ip ?? 'unknown'}`;
    const rl = await this.rateLimitService.hit(rateLimitKey, 5, 3600);
    if (!rl.allowed) {
      throw new HttpException(
        { code: 'rate_limited', retryAfterSec: rl.retryAfterSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    // Every failure below is the same generic response — an unknown tenant,
    // wrong email, wrong password, wrong TOTP, or a real operator's
    // credentials must all look identical from the outside.
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    });
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Break-glass is available to owners only');
    }

    const validPassword = await this.passwordService.verify(
      password,
      user.passwordHash,
    );
    if (!validPassword) throw new UnauthorizedException('Invalid credentials');

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const validTotp = await this.mfaService.verifyTotp(totp, user.mfaSecret);
    if (!validTotp) throw new UnauthorizedException('Invalid credentials');

    const refreshToken = this.tokenService.generateRefreshToken();
    const { id: sessionId } = await this.tokenService.createSession(
      user.id,
      tenant.id,
      refreshToken,
    );
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        amr: ['pwd', 'otp', 'break_glass'],
        expiresAt: new Date(Date.now() + BREAK_GLASS_SESSION_TTL_MS),
      },
    });

    const accessToken = await this.tokenService.issueAccessToken({
      userId: user.id,
      tenantId: tenant.id,
      role: 'owner',
      sessionId,
    });

    await this.auditService.record({
      tenantId: tenant.id,
      actor: { type: 'user', id: user.id, ip },
      action: 'auth.break_glass',
      target: { type: 'tenant', id: tenant.id },
      payload: {},
    });
    this.eventEmitter.emit('auth.break_glass', {
      tenantId: tenant.id,
      userId: user.id,
      ip,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      user: toSafeUser(user),
      activeTenantId: tenant.id,
      activeRole: 'owner' as const,
    };
  }
}
