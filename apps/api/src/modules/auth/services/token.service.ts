import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashForStorage, StaticKeyRing, type KeyRing } from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import crypto from 'node:crypto';

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
  platformRole?: string;
  sessionId: string;
}

export interface DecodedToken {
  sub: string;
  tid: string;
  role: string;
  prole?: string;
  sid: string;
  kid: string;
  iat: number;
  exp: number;
}

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** Parses a short duration string ("15m", "30d") into seconds. */
function parseDurationSeconds(value: string): number {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration string: ${value}`);
  }
  return parseInt(match[1], 10) * DURATION_UNITS[match[2]];
}

@Injectable()
export class TokenService {
  private readonly keyRing: KeyRing;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    private prisma: PrismaClient,
    private jwtService: JwtService,
  ) {
    const env = loadEnv();
    this.keyRing = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);
    this.accessTtlSeconds = parseDurationSeconds(env.JWT_ACCESS_TTL);

    const match = env.REFRESH_TTL.match(/^(\d+)d$/);
    this.refreshTtlDays = match ? parseInt(match[1], 10) : 30;
  }

  getAccessTokenTtlSeconds(): number {
    return this.accessTtlSeconds;
  }

  async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    const { kid, secret } = this.keyRing.active();
    return this.jwtService.signAsync(
      {
        sub: payload.userId,
        tid: payload.tenantId,
        role: payload.role,
        prole: payload.platformRole,
        sid: payload.sessionId,
        typ: 'access',
      },
      {
        secret: Buffer.from(secret),
        expiresIn: this.accessTtlSeconds,
        keyid: kid,
      },
    );
  }

  verifyAccessToken(token: string): DecodedToken {
    const decoded = this.jwtService.decode(token, { complete: true }) as {
      header: { kid?: string };
    } | null;
    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid token');
    }

    const kid = decoded.header.kid;
    const secret = this.keyRing.get(kid);
    if (!secret) {
      throw new UnauthorizedException('Unknown signing key');
    }

    let payload: DecodedToken & { typ?: string; mfa?: boolean };
    try {
      payload = this.jwtService.verify<
        DecodedToken & { typ?: string; mfa?: boolean }
      >(token, { secret: Buffer.from(secret) });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    // Only tokens minted by issueAccessToken are access tokens. MFA-challenge and any
    // other JWTs signed with the same key ring must never authenticate a request.
    if (payload.typ !== 'access' || payload.mfa) {
      throw new UnauthorizedException('Not an access token');
    }
    return payload;
  }

  async issueMfaToken(userId: string): Promise<string> {
    const { kid, secret } = this.keyRing.active();
    return this.jwtService.signAsync(
      { sub: userId, mfa: true, typ: 'mfa' },
      { secret: Buffer.from(secret), expiresIn: '5m', keyid: kid },
    );
  }

  verifyMfaToken(token: string): { userId: string } {
    const decoded = this.jwtService.decode(token, { complete: true }) as {
      header: { kid?: string };
    } | null;
    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    const secret = this.keyRing.get(decoded.header.kid);
    if (!secret) {
      throw new UnauthorizedException('Unknown signing key');
    }

    try {
      const payload = this.jwtService.verify<{
        sub: string;
        mfa?: boolean;
        typ?: string;
      }>(token, { secret: Buffer.from(secret) });
      if (!payload.mfa || payload.typ !== 'mfa') {
        throw new UnauthorizedException('Not an MFA token');
      }
      return { userId: payload.sub };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createSession(
    userId: string,
    tenantId: string | null,
    refreshToken: string,
    userAgent?: string,
    ipPrefix?: string,
  ): Promise<{ id: string; familyId: string }> {
    const hash = hashForStorage(refreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTtlDays);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: hash,
        familyId,
        userAgent,
        ipPrefix,
        expiresAt,
      },
    });

    return { id: session.id, familyId };
  }

  async rotateRefreshToken(
    oldRefreshToken: string,
    userAgent?: string,
    ipPrefix?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    session: { id: string };
  }> {
    const oldHash = hashForStorage(oldRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: oldHash },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      // A hash only gets here by being the *current* hash of a row at some
      // point. If that row was retired by a later rotation ('rotated') and
      // this stale hash is being replayed, someone has a copy of a
      // superseded token — assume compromise and kill the whole family.
      if (session.revokedReason === 'rotated') {
        await this.revokeFamily(session.familyId, 'reuse-detected');
      }
      throw new UnauthorizedException({ error: 'refresh_reuse_detected' });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Normal rotation: retire this row and create a new one in the same
    // family. Keeping the retired row (rather than overwriting its hash in
    // place) is what makes the reuse check above possible.
    const newRefreshToken = this.generateRefreshToken();
    const newHash = hashForStorage(newRefreshToken);
    const now = new Date();

    const newSession = await this.prisma.session.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId,
        refreshTokenHash: newHash,
        familyId: session.familyId,
        userAgent: userAgent ?? session.userAgent,
        ipPrefix: ipPrefix ?? session.ipPrefix,
        expiresAt: session.expiresAt,
        lastSeenAt: now,
      },
    });

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now, revokedReason: 'rotated' },
    });

    // Resolve current tenant context
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: session.userId,
        tenantId: session.tenantId ?? undefined,
      },
    });
    const membershipAny =
      membership ??
      (await this.prisma.membership.findFirst({
        where: { userId: session.userId },
      }));

    const tenantId = membershipAny?.tenantId ?? session.tenantId ?? '';
    const role = (membershipAny?.role as string) ?? 'viewer';

    const accessToken = await this.issueAccessToken({
      userId: session.userId,
      tenantId,
      role,
      sessionId: newSession.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      session: { id: newSession.id },
    };
  }

  /** A token referencing a session that doesn't exist is treated the same as revoked. */
  async isSessionRevoked(sessionId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true },
    });
    return !session || session.revokedAt != null;
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    reason: string = 'user',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
    reason: string = 'user',
  ): Promise<void> {
    const where: Prisma.SessionWhereInput = { userId, revokedAt: null };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }
    await this.prisma.session.updateMany({
      where,
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(
    familyId: string,
    reason: string = 'reuse-detected',
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
