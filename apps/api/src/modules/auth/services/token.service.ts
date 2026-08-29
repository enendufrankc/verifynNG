import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
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

@Injectable()
export class TokenService {
  private readonly keyRing: KeyRing;
  private readonly accessTtl: string;
  private readonly refreshTtlDays: number;

  constructor(private prisma: PrismaClient, private jwtService: JwtService) {
    const env = loadEnv();
    this.keyRing = new StaticKeyRing(env.JWT_KEYS, env.JWT_ACTIVE_KID);
    this.accessTtl = env.JWT_ACCESS_TTL;

    const match = env.REFRESH_TTL.match(/^(\d+)d$/);
    this.refreshTtlDays = match ? parseInt(match[1], 10) : 30;
  }

  async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    const { kid, secret } = this.keyRing.active();
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      {
        sub: payload.userId,
        tid: payload.tenantId,
        role: payload.role,
        prole: payload.platformRole,
        sid: payload.sessionId,
      },
      Buffer.from(secret),
      { expiresIn: this.accessTtl, keyid: kid },
    );
  }

  verifyAccessToken(token: string): DecodedToken {
    const decoded = this.jwtService.decode(token, { complete: true }) as any;
    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid token');
    }

    const kid = decoded.header.kid;
    const secret = this.keyRing.get(kid);
    if (!secret) {
      throw new UnauthorizedException('Unknown signing key');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: Buffer.from(secret) as any,
      }) as any;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async issueMfaToken(userId: string): Promise<string> {
    const { kid, secret } = this.keyRing.active();
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { sub: userId, mfa: true },
      Buffer.from(secret),
      { expiresIn: '5m', keyid: kid },
    );
  }

  verifyMfaToken(token: string): { userId: string } {
    const decoded = this.jwtService.decode(token, { complete: true }) as any;
    if (!decoded?.header?.kid) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    const secret = this.keyRing.get(decoded.header.kid);
    if (!secret) {
      throw new UnauthorizedException('Unknown signing key');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: Buffer.from(secret) as any,
      }) as any;
      if (!payload.mfa) {
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
      throw new UnauthorizedException({ error: 'refresh_reuse_detected' });
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Reuse detection: check if a newer token exists for this family
    const latestInFamily = await this.prisma.session.findFirst({
      where: { familyId: session.familyId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (
      latestInFamily &&
      latestInFamily.id !== session.id &&
      latestInFamily.lastSeenAt > session.lastSeenAt
    ) {
      // REUSE DETECTED — revoke the whole family
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'reuse-detected' },
      });

      throw new UnauthorizedException({ error: 'refresh_reuse_detected' });
    }

    // Normal rotation
    const newRefreshToken = this.generateRefreshToken();
    const newHash = hashForStorage(newRefreshToken);

    const now = new Date();
    const shouldUpdateLastSeen =
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000;

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        ...(shouldUpdateLastSeen ? { lastSeenAt: now } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(ipPrefix ? { ipPrefix } : {}),
      },
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
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      session: { id: session.id },
    };
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
    const where: any = { userId, revokedAt: null };
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
