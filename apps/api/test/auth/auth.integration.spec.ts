import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generate } from 'otplib';
import type { PrismaClient } from '@prisma/client';
import {
  createTestDatabase,
  dropTestSchema,
  disconnectTestHelper,
} from '@verifynng/db';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PasswordService } from '../../src/modules/auth/services/password.service';
import { TokenService } from '../../src/modules/auth/services/token.service';
import { MfaService } from '../../src/modules/auth/services/mfa.service';
import { LoginPolicyRegistry } from '../../src/modules/auth/login-policy-hook';
import type {
  Mailer,
  MailMessage,
} from '../../src/modules/auth/mailer/mailer.interface';

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
  }
}

const PASSWORD = 'Passw0rd!Passw0rd!';
let counter = 0;
function uniqueEmail(): string {
  return `user_${++counter}_${Date.now()}@x.io`;
}

describe('AuthService (integration)', () => {
  let prisma: PrismaClient;
  let schemaName: string;
  let authService: AuthService;
  let tokenService: TokenService;
  let mailer: FakeMailer;

  beforeAll(async () => {
    const db = await createTestDatabase('auth-service-integration-test');
    prisma = db.prisma;
    schemaName = db.schemaName;

    mailer = new FakeMailer();
    tokenService = new TokenService(prisma, new JwtService());
    authService = new AuthService(
      prisma,
      new PasswordService(),
      tokenService,
      new MfaService(),
      new EventEmitter2(),
      mailer,
      new LoginPolicyRegistry(),
    );
  });

  afterAll(async () => {
    await dropTestSchema(schemaName, prisma);
    await disconnectTestHelper();
  });

  it('registers a user without a raw password or membership leaking into the response', async () => {
    const email = uniqueEmail();
    const result = await authService.register(email, PASSWORD, 'A');
    expect(result.user.email).toBe(email);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('mfaSecret');
    expect(result.user).not.toHaveProperty('recoveryCodes');
  });

  it('rejects registering the same email twice', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');
    await expect(authService.register(email, PASSWORD, 'A')).rejects.toThrow();
  });

  it('full register -> login -> refresh -> reuse -> revoked flow', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');

    const loginResult = await authService.login(
      email,
      PASSWORD,
      undefined,
      'UA/1',
      '203.0.113.1',
    );
    if (!('accessToken' in loginResult))
      throw new Error('expected direct login');
    const { accessToken, refreshToken, expiresIn } = loginResult;
    expect(expiresIn).toBe(tokenService.getAccessTokenTtlSeconds());

    const decoded = tokenService.verifyAccessToken(accessToken);
    expect(decoded.sub).toBeDefined();

    const me = await authService.me(decoded.sub, decoded.tid);
    expect(me.user.email).toBe(email);
    expect(me.memberships).toEqual([]);

    // Refresh rotates the pair.
    const refreshed = await authService.refresh(refreshToken);
    expect(refreshed.accessToken).not.toBe(accessToken);
    expect(refreshed.refreshToken).not.toBe(refreshToken);

    // Reusing the superseded refresh token is a hard failure...
    await expect(authService.refresh(refreshToken)).rejects.toThrow();

    // ...and revokes the whole session family: even the freshly-rotated
    // access token's session is now gone.
    const refreshedDecoded = tokenService.verifyAccessToken(
      refreshed.accessToken,
    );
    expect(await tokenService.isSessionRevoked(refreshedDecoded.sid)).toBe(
      true,
    );
  });

  it('locks the account after 10 failed login attempts', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');

    for (let i = 0; i < 10; i++) {
      await expect(authService.login(email, 'WrongPassword!1')).rejects.toThrow(
        'Invalid credentials',
      );
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.failedLoginCount).toBe(10);
    expect(user.lockedUntil).not.toBeNull();
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even the correct password is rejected while locked.
    await expect(authService.login(email, PASSWORD)).rejects.toThrow(
      'Account locked',
    );
  });

  it('MFA setup -> enable -> login requires challenge -> TOTP completes login', async () => {
    const email = uniqueEmail();
    const { user } = await authService.register(email, PASSWORD, 'A');

    const setup = await authService.mfaSetup(user.id);
    expect(setup.otpauthUri).toContain('otpauth://totp/');

    const code = await generate({ secret: setup.secret });
    const enabled = await authService.mfaEnable(user.id, code);
    expect(enabled.recoveryCodes).toHaveLength(10);

    const loginResult = await authService.login(email, PASSWORD);
    expect(loginResult).toMatchObject({ mfaRequired: true });
    if (!('mfaToken' in loginResult)) throw new Error('expected mfaRequired');

    const freshCode = await generate({ secret: setup.secret });
    const challengeResult = await authService.mfaChallenge(
      loginResult.mfaToken,
      freshCode,
    );
    expect(challengeResult).toHaveProperty('accessToken');
  });

  it('a recovery code completes MFA login exactly once', async () => {
    const email = uniqueEmail();
    const { user } = await authService.register(email, PASSWORD, 'A');
    const setup = await authService.mfaSetup(user.id);
    const enableCode = await generate({ secret: setup.secret });
    const { recoveryCodes } = await authService.mfaEnable(user.id, enableCode);

    const loginResult = await authService.login(email, PASSWORD);
    if (!('mfaToken' in loginResult)) throw new Error('expected mfaRequired');

    const first = await authService.mfaChallenge(
      loginResult.mfaToken,
      undefined,
      recoveryCodes[0],
    );
    expect(first).toHaveProperty('accessToken');

    await expect(
      authService.mfaChallenge(
        loginResult.mfaToken,
        undefined,
        recoveryCodes[0],
      ),
    ).rejects.toThrow('Invalid recovery code');
  });

  it('forgotPassword sends exactly one mail for a known user and none for an unknown one', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');

    const before = mailer.sent.length;
    await authService.forgotPassword(email);
    expect(mailer.sent.length).toBe(before + 1);
    expect(mailer.sent[mailer.sent.length - 1]).toMatchObject({
      to: email,
      template: 'password-reset',
    });

    await authService.forgotPassword('nobody-at-all@x.io');
    expect(mailer.sent.length).toBe(before + 1); // unchanged — no enumeration
  });

  it('resetPassword sets a new password and revokes every session', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');
    const login1 = await authService.login(email, PASSWORD);
    if (!('accessToken' in login1)) throw new Error('expected direct login');

    await authService.forgotPassword(email);
    const mail = mailer.sent[mailer.sent.length - 1];
    const token = mail.vars.token;

    const newPassword = 'NewPassw0rd!123';
    await authService.resetPassword(token, newPassword);

    // Old session is gone.
    const decoded = tokenService.verifyAccessToken(login1.accessToken);
    expect(await tokenService.isSessionRevoked(decoded.sid)).toBe(true);

    // Old password no longer works; new one does.
    await expect(authService.login(email, PASSWORD)).rejects.toThrow();
    await expect(authService.login(email, newPassword)).resolves.toBeDefined();
  });

  it('changePassword revokes other sessions but keeps the current one', async () => {
    const email = uniqueEmail();
    await authService.register(email, PASSWORD, 'A');
    const sessionA = await authService.login(email, PASSWORD);
    const sessionB = await authService.login(email, PASSWORD);
    if (!('accessToken' in sessionA) || !('accessToken' in sessionB)) {
      throw new Error('expected direct logins');
    }

    const decodedA = tokenService.verifyAccessToken(sessionA.accessToken);
    const decodedB = tokenService.verifyAccessToken(sessionB.accessToken);

    await authService.changePassword(
      decodedA.sub,
      PASSWORD,
      'AnotherPassw0rd!1',
      decodedA.sid,
    );

    expect(await tokenService.isSessionRevoked(decodedA.sid)).toBe(false);
    expect(await tokenService.isSessionRevoked(decodedB.sid)).toBe(true);
  });
});
