import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { user } from '@verifynng/db/testing';
import { TokenService } from '../../src/modules/auth/services/token.service';

const K1_SECRET_HEX = '1'.repeat(68);
const K2_SECRET_HEX = '2'.repeat(68);
const K3_SECRET_HEX = '3'.repeat(68);

// Two active signing keys so we can exercise `kid` rotation without
// fighting @verifynng/config's process-wide loadEnv() memoization.
process.env.JWT_KEYS = `k1:${K1_SECRET_HEX},k2:${K2_SECRET_HEX}`;
process.env.JWT_ACTIVE_KID = 'k2';
process.env.JWT_ACCESS_TTL = '15m';
process.env.REFRESH_TTL = '30d';

describe('TokenService', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let tokenService: TokenService;
  let userId: string;

  beforeAll(async () => {
    const db = await createTestDatabase('token-service-test');
    prisma = db.prisma;
    schemaName = db.schemaName;
    tokenService = new TokenService(prisma, new JwtService());
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  beforeEach(async () => {
    const u = await user(prisma);
    userId = u.id;
  });

  it('reports the configured access token TTL in seconds', () => {
    expect(tokenService.getAccessTokenTtlSeconds()).toBe(15 * 60);
  });

  it('issues an access token whose exp - iat matches the configured TTL', async () => {
    const token = await tokenService.issueAccessToken({
      userId,
      tenantId: 'tenant-1',
      role: 'owner',
      sessionId: 'session-1',
    });
    const decoded = tokenService.verifyAccessToken(token);
    expect(decoded.exp - decoded.iat).toBe(900);
    expect(decoded.sub).toBe(userId);
    expect(decoded.tid).toBe('tenant-1');
    expect(decoded.role).toBe('owner');
    expect(decoded.sid).toBe('session-1');
  });

  it('signs new tokens with the currently active kid', async () => {
    const token = await tokenService.issueAccessToken({
      userId,
      tenantId: 'tenant-1',
      role: 'owner',
      sessionId: 'session-1',
    });
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    expect(header.kid).toBe('k2');
  });

  it('still verifies a token signed under a previously active kid', async () => {
    // Simulate a token minted while k1 was the active key — a fresh
    // TokenService pointed at the same keyring would sign with k1.
    const jwt = new JwtService();
    const oldToken = await jwt.signAsync(
      {
        sub: userId,
        tid: 'tenant-1',
        role: 'owner',
        sid: 'session-old',
        typ: 'access',
      },
      {
        secret: Buffer.from(K1_SECRET_HEX, 'hex'),
        expiresIn: '15m',
        keyid: 'k1',
      },
    );

    const decoded = tokenService.verifyAccessToken(oldToken);
    expect(decoded.sub).toBe(userId);
    expect(decoded.sid).toBe('session-old');
  });

  it('rejects a token signed with an unknown kid', async () => {
    const jwt = new JwtService();
    const rogueToken = await jwt.signAsync(
      { sub: userId, tid: 't', role: 'owner', sid: 's' },
      {
        secret: Buffer.from(K3_SECRET_HEX, 'hex'),
        expiresIn: '15m',
        keyid: 'k3',
      },
    );
    expect(() => tokenService.verifyAccessToken(rogueToken)).toThrow();
  });

  it('creates a session and rotates its refresh token into a new row in the same family', async () => {
    const rawToken = tokenService.generateRefreshToken();
    const { id: sessionId, familyId } = await tokenService.createSession(
      userId,
      'tenant-1',
      rawToken,
      'UA/1.0',
      '203.0.113.0',
    );

    const result = await tokenService.rotateRefreshToken(rawToken, 'UA/1.0');
    expect(result.session.id).not.toBe(sessionId);
    expect(result.refreshToken).not.toBe(rawToken);

    // The original row is retired (so a replay of its hash can be detected)
    // but is not itself a security revocation.
    const original = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(original.revokedReason).toBe('rotated');

    // The new row is the live one for the family.
    const rotated = await prisma.session.findUniqueOrThrow({
      where: { id: result.session.id },
    });
    expect(rotated.familyId).toBe(familyId);
    expect(await tokenService.isSessionRevoked(result.session.id)).toBe(false);
  });

  it('detects reuse of a superseded refresh token and revokes the family', async () => {
    const rawToken = tokenService.generateRefreshToken();
    const { familyId } = await tokenService.createSession(
      userId,
      'tenant-1',
      rawToken,
    );

    // First rotation succeeds and retires rawToken's row.
    const rotated = await tokenService.rotateRefreshToken(rawToken);

    // Reusing the now-superseded token must fail and revoke the family.
    await expect(tokenService.rotateRefreshToken(rawToken)).rejects.toThrow();
    expect(await tokenService.isSessionRevoked(rotated.session.id)).toBe(true);

    const liveSession = await prisma.session.findUniqueOrThrow({
      where: { id: rotated.session.id },
    });
    expect(liveSession.familyId).toBe(familyId);
    expect(liveSession.revokedReason).toBe('reuse-detected');
  });

  it('rejects rotating an already-revoked refresh token', async () => {
    const rawToken = tokenService.generateRefreshToken();
    const { id: sessionId } = await tokenService.createSession(
      userId,
      'tenant-1',
      rawToken,
    );
    await tokenService.revokeSession(userId, sessionId, 'user');

    await expect(tokenService.rotateRefreshToken(rawToken)).rejects.toThrow();
  });

  it('revokeAllSessions revokes every session except the one excluded', async () => {
    const tokenA = tokenService.generateRefreshToken();
    const tokenB = tokenService.generateRefreshToken();
    const { id: sessionA } = await tokenService.createSession(
      userId,
      'tenant-1',
      tokenA,
    );
    const { id: sessionB } = await tokenService.createSession(
      userId,
      'tenant-1',
      tokenB,
    );

    await tokenService.revokeAllSessions(userId, sessionB, 'user');

    expect(await tokenService.isSessionRevoked(sessionA)).toBe(true);
    expect(await tokenService.isSessionRevoked(sessionB)).toBe(false);
  });

  it('issues and verifies a short-lived MFA token', async () => {
    const mfaToken = await tokenService.issueMfaToken(userId);
    const { userId: decodedUserId } = tokenService.verifyMfaToken(mfaToken);
    expect(decodedUserId).toBe(userId);
  });

  it('rejects a regular access token when used as an MFA token', async () => {
    const accessToken = await tokenService.issueAccessToken({
      userId,
      tenantId: 'tenant-1',
      role: 'owner',
      sessionId: 'session-1',
    });
    expect(() => tokenService.verifyMfaToken(accessToken)).toThrow();
  });

  it('rejects an MFA challenge token when used as an access token (no pre-2FA sessions)', async () => {
    const mfaToken = await tokenService.issueMfaToken(userId);
    expect(() => tokenService.verifyAccessToken(mfaToken)).toThrow(
      UnauthorizedException,
    );
  });
});
