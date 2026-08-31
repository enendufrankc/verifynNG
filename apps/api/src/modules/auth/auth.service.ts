import crypto from 'node:crypto';
import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, type Membership, type User } from '@prisma/client';
import { hashForStorage } from '@verifynng/core';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { MAILER, type Mailer } from './mailer/mailer.interface';
import { toSafeUser, type SafeUser } from './utils/safe-user';
import { LoginPolicyRegistry } from './login-policy-hook';

export interface CompleteLoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: SafeUser;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: string;
  }>;
  activeTenantId: string | null;
  activeRole: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private passwordService: PasswordService,
    private tokenService: TokenService,
    private mfaService: MfaService,
    private eventEmitter: EventEmitter2,
    @Inject(MAILER) private mailer: Mailer,
    private loginPolicyRegistry: LoginPolicyRegistry,
  ) {}

  // ── Registration ─────────────────────────────────────────

  async register(email: string, password: string, displayName: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName },
    });

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
      at: new Date(),
    });

    return { user: toSafeUser(user) };
  }

  // ── Login ────────────────────────────────────────────────

  async login(
    email: string,
    password: string,
    tenantSlug?: string,
    userAgent?: string,
    ip?: string,
  ): Promise<
    | { mfaRequired: true; mfaToken: string }
    | (CompleteLoginResult & { mfaGraceUntil?: Date })
  > {
    // Hooks (E20: EnforceSsoLoginHook) only have a specific tenant to
    // evaluate against when the caller resolves one — a bare email+password
    // login with no `tenant` keeps its pre-E20 behaviour untouched.
    let tenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      tenantId = tenant?.id;
      if (tenantId) {
        for (const hook of this.loginPolicyRegistry.getHooks()) {
          if (hook.beforePasswordLogin) {
            await hook.beforePasswordLogin({ tenantId, tenantSlug });
          }
        }
      }
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.eventEmitter.emit('user.login.failed', {
        emailHash: hashForStorage(email),
        ipHash: ip ? hashForStorage(ip) : null,
        reason: 'locked',
        at: new Date(),
      });
      throw new UnauthorizedException('Account locked');
    }

    const valid = await this.passwordService.verify(
      password,
      user.passwordHash,
    );
    if (!valid) {
      await this.handleFailedLogin(user, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    let membership: Membership | null = null;
    if (tenantId) {
      membership = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId } },
      });
      // A tenant was named but this user has no membership there — same
      // response as any other invalid attempt, no enumeration.
      if (!membership) throw new UnauthorizedException('Invalid credentials');
    }

    let policyResult:
      | { requireMfa: boolean; reason?: string; graceUntil?: Date }
      | undefined;
    if (tenantId && membership) {
      for (const hook of this.loginPolicyRegistry.getHooks()) {
        if (!hook.afterPrimaryAuth) continue;
        const result = await hook.afterPrimaryAuth({
          userId: user.id,
          tenantId,
          role: membership.role,
        });
        if (result.requireMfa || result.reason) {
          policyResult = result;
          break;
        }
      }
    }

    // Native `mfaEnabled` is the only trigger for "challenge now" — a hook's
    // `requireMfa: true` for a not-yet-enrolled user surfaces as `reason`
    // (grace / enrolment_required) below instead, since there's no secret to
    // challenge against yet.
    if (user.mfaEnabled) {
      const mfaToken = await this.tokenService.issueMfaToken(user.id, tenantId);
      return { mfaRequired: true, mfaToken };
    }
    if (policyResult?.reason === 'enrolment_required') {
      throw new ForbiddenException({ code: 'mfa_enrolment_required' });
    }

    const result = await this.completeLogin(user, tenantId, userAgent, ip);
    if (policyResult?.reason === 'grace' && policyResult.graceUntil) {
      return { ...result, mfaGraceUntil: policyResult.graceUntil };
    }
    return result;
  }

  private async handleFailedLogin(user: User, ip?: string) {
    const newCount = user.failedLoginCount + 1;
    const lockUntil =
      newCount >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: newCount,
        lockedUntil: lockUntil,
      },
    });

    this.eventEmitter.emit('user.login.failed', {
      emailHash: hashForStorage(user.email),
      ipHash: ip ? hashForStorage(ip) : null,
      reason: newCount >= 10 ? 'locked' : 'password',
      at: new Date(),
    });
  }

  private async completeLogin(
    user: User,
    preferredTenantId?: string,
    userAgent?: string,
    ip?: string,
    mfaUsed = false,
  ): Promise<CompleteLoginResult> {
    // Reset failed login count
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    // Determine tenant context
    const { memberships, activeMembership } = await this.getMemberships(
      user.id,
      preferredTenantId,
    );
    const tenantId = activeMembership?.tenantId ?? '';
    const role = activeMembership?.role ?? 'viewer';

    // Create session
    const refreshToken = this.tokenService.generateRefreshToken();
    const ipPrefix = ip ? this.truncateIp(ip) : undefined;
    const { id: sessionId } = await this.tokenService.createSession(
      user.id,
      tenantId,
      refreshToken,
      userAgent,
      ipPrefix,
    );

    const accessToken = await this.tokenService.issueAccessToken({
      userId: user.id,
      tenantId,
      role,
      platformRole: user.platformRole ?? undefined,
      sessionId,
    });

    this.eventEmitter.emit('user.login', {
      userId: user.id,
      tenantId: tenantId || null,
      sessionId,
      ipHash: ip ? hashForStorage(ip) : null,
      userAgent,
      mfaUsed,
      at: new Date(),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      user: toSafeUser(user),
      memberships,
      activeTenantId: tenantId || null,
      activeRole: role,
    };
  }

  /** Shared by completeLogin and refresh so both repopulate the same client state. */
  private async getMemberships(userId: string, preferredTenantId?: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
    const memberships = rows.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      role: m.role,
    }));
    const activeMembership = preferredTenantId
      ? (rows.find((m) => m.tenantId === preferredTenantId) ?? rows[0])
      : rows[0];
    return { memberships, activeMembership };
  }

  private truncateIp(ip: string): string {
    if (ip.includes(':')) {
      // IPv6: /48
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + '::';
    }
    // IPv4: /24
    const parts = ip.split('.');
    return parts.slice(0, 3).join('.') + '.0';
  }

  // ── Refresh / Logout ─────────────────────────────────────

  async refresh(oldRefreshToken: string, userAgent?: string, ip?: string) {
    const ipPrefix = ip ? this.truncateIp(ip) : undefined;
    const result = await this.tokenService.rotateRefreshToken(
      oldRefreshToken,
      userAgent,
      ipPrefix,
    );

    // Emit event for the new session activity
    this.eventEmitter.emit('session.refreshed', {
      sessionId: result.session.id,
      at: new Date(),
    });

    // AuthBootstrap calls this on every page load to survive a hard reload,
    // so it needs the same user/membership context completeLogin returns —
    // otherwise a reload silently drops activeTenantId/activeRole and every
    // tenant-scoped page looks empty with no owner-only actions.
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: result.session.id },
    });
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: session.userId },
    });
    const { memberships, activeMembership } = await this.getMemberships(
      user.id,
      session.tenantId ?? undefined,
    );

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      user: toSafeUser(user),
      memberships,
      activeTenantId: activeMembership?.tenantId ?? null,
      activeRole: activeMembership?.role ?? null,
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const hash = hashForStorage(refreshToken);
      const session = await this.prisma.session.findUnique({
        where: { refreshTokenHash: hash },
      });
      if (session) {
        await this.tokenService.revokeSession(userId, session.id, 'user');
        this.eventEmitter.emit('session.revoked', {
          userId,
          sessionId: session.id,
          by: 'user',
          at: new Date(),
        });
      }
    }
  }

  // ── Me / Switch Tenant ───────────────────────────────────

  async me(userId: string, activeTenantId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { tenant: true } },
      },
    });
    if (!user) throw new UnauthorizedException();

    return {
      user: toSafeUser(user),
      activeTenantId: activeTenantId || null,
      mfaEnabled: user.mfaEnabled,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
        tenant: { id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug },
      })),
    };
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    currentSessionId: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership) {
      throw new NotFoundException('No membership for this tenant');
    }

    // Update session's active tenant
    await this.prisma.session.update({
      where: { id: currentSessionId },
      data: { tenantId },
    });

    const accessToken = await this.tokenService.issueAccessToken({
      userId,
      tenantId,
      role: membership.role,
      sessionId: currentSessionId,
    });

    // Issue a new refresh token for the new context
    const newRefresh = this.tokenService.generateRefreshToken();
    const newHash = hashForStorage(newRefresh);
    await this.prisma.session.update({
      where: { id: currentSessionId },
      data: { refreshTokenHash: newHash, lastSeenAt: new Date() },
    });

    return { accessToken, refreshToken: newRefresh };
  }

  // ── MFA ──────────────────────────────────────────────────

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const { secret, otpauthUri, encrypted } = this.mfaService.generateSecret(
      user.email,
    );

    // Store encrypted secret (not yet enabled — enable requires verification)
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encrypted },
    });

    const qr = await import('qrcode');
    const qrDataUrl = await qr.toDataURL(otpauthUri);

    return { secret, otpauthUri, qrDataUrl };
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) {
      throw new UnauthorizedException('MFA not set up');
    }

    const valid = await this.mfaService.verifyTotp(code, user.mfaSecret);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const recoveryCodes = this.mfaService.generateRecoveryCodes();
    const hashedCodes = await this.mfaService.hashRecoveryCodes(recoveryCodes);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        recoveryCodes: hashedCodes,
      },
    });

    this.eventEmitter.emit('user.mfa.enabled', { userId, at: new Date() });

    return { recoveryCodes };
  }

  async mfaDisable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled) {
      throw new UnauthorizedException('MFA not enabled');
    }

    const validPassword = await this.passwordService.verify(
      password,
      user.passwordHash!,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    const validCode = await this.mfaService.verifyTotp(code, user.mfaSecret!);
    if (!validCode) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        recoveryCodes: [],
      },
    });

    this.eventEmitter.emit('user.mfa.disabled', { userId, at: new Date() });
  }

  async mfaChallenge(
    mfaToken: string,
    code?: string,
    recoveryCode?: string,
    userAgent?: string,
    ip?: string,
  ) {
    const { userId, tenantId } = this.tokenService.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled) {
      throw new UnauthorizedException('MFA not enabled');
    }

    if (recoveryCode) {
      const result = await this.mfaService.consumeRecoveryCode(
        recoveryCode,
        user.recoveryCodes,
      );
      if (!result.valid) {
        throw new UnauthorizedException('Invalid recovery code');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { recoveryCodes: result.remaining },
      });
    } else if (code) {
      const valid = await this.mfaService.verifyTotp(code, user.mfaSecret!);
      if (!valid) {
        this.eventEmitter.emit('user.login.failed', {
          emailHash: hashForStorage(user.email),
          ipHash: ip ? hashForStorage(ip) : null,
          reason: 'mfa',
          at: new Date(),
        });
        throw new UnauthorizedException('Invalid TOTP code');
      }
    } else {
      throw new UnauthorizedException('Code or recovery code required');
    }

    return this.completeLogin(user, tenantId, userAgent, ip, true);
  }

  async mfaRecoveryCodesRotate(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('MFA not enabled');
    }

    const valid = await this.mfaService.verifyTotp(code, user.mfaSecret);
    if (!valid) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const recoveryCodes = this.mfaService.generateRecoveryCodes();
    const hashedCodes = await this.mfaService.hashRecoveryCodes(recoveryCodes);

    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodes: hashedCodes },
    });

    return { recoveryCodes };
  }

  // ── Password Reset / Change ──────────────────────────────

  async forgotPassword(email: string) {
    // Always return 202 — no user enumeration
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // silently skip

    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = hashForStorage(token);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
      },
    });

    await this.mailer.send({
      to: email,
      template: 'password-reset',
      vars: { token },
    });
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashForStorage(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      // Revoke all sessions
      this.prisma.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password-reset' },
      }),
    ]);

    this.eventEmitter.emit('user.password.reset', {
      userId: resetToken.userId,
      at: new Date(),
    });

    this.eventEmitter.emit('session.revoked', {
      userId: resetToken.userId,
      sessionId: '*',
      by: 'system',
      at: new Date(),
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentSessionId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException();
    }

    const valid = await this.passwordService.verify(
      currentPassword,
      user.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await this.passwordService.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      // Revoke all OTHER sessions
      this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          id: { not: currentSessionId },
        },
        data: { revokedAt: new Date(), revokedReason: 'password-change' },
      }),
    ]);
  }

  // ── Sessions ─────────────────────────────────────────────

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipPrefix: s.ipPrefix,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSessionById(userId: string, sessionId: string) {
    await this.tokenService.revokeSession(userId, sessionId, 'user');
    this.eventEmitter.emit('session.revoked', {
      userId,
      sessionId,
      by: 'user',
      at: new Date(),
    });
  }

  async revokeAllOtherSessions(userId: string, currentSessionId: string) {
    await this.tokenService.revokeAllSessions(userId, currentSessionId, 'user');
  }
}
