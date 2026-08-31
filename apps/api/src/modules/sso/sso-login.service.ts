import crypto from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as client from 'openid-client';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '@verifynng/config';
import { TokenService } from '../auth/services/token.service';
import { toSafeUser } from '../auth/utils/safe-user';
import { AuditService } from '../audit/audit.service.js';
import { SsoConfigService } from './sso-config.service';
import { OidcClientFactory } from './oidc-client-factory';
import { AccountLinker } from './account-linker';

export type SsoErrorCode =
  | 'sso_not_configured'
  | 'invalid_redirect'
  | 'state_mismatch'
  | 'idp_unreachable'
  | 'email_unverified'
  | 'domain_not_allowed'
  | 'jit_disabled'
  | 'idp_error';

export class SsoError extends Error {
  constructor(
    public readonly code: SsoErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

interface StoredAuthRequest {
  tenantId: string;
  tenantSlug: string;
  provider: 'google' | 'microsoft' | 'fake';
  codeVerifier: string;
  nonce: string;
  redirectTo?: string;
}

export interface CompletedLogin {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ReturnType<typeof toSafeUser>;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: string;
  }>;
  activeTenantId: string;
  activeRole: string;
}

const STATE_KEY_PREFIX = 'sso:state:';
const COMPLETE_KEY_PREFIX = 'sso:complete:';
const COMPLETE_TTL_SECONDS = 60;

@Injectable()
export class SsoLoginService {
  private readonly logger = new Logger(SsoLoginService.name);
  private readonly callbackUrl: string;
  private readonly stateTtlSeconds: number;
  private readonly appBaseUrl: string;
  private readonly fakeOidcIssuer: string;
  private readonly fakeOidcPublicIssuer: string;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly ssoConfig: SsoConfigService,
    private readonly oidcClientFactory: OidcClientFactory,
    private readonly accountLinker: AccountLinker,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
  ) {
    const env = loadEnv();
    this.callbackUrl = env.SSO_CALLBACK_URL;
    this.stateTtlSeconds = env.SSO_STATE_TTL_SECONDS;
    this.appBaseUrl = env.APP_BASE_URL;
    this.fakeOidcIssuer = env.FAKE_OIDC_ISSUER;
    this.fakeOidcPublicIssuer = env.FAKE_OIDC_PUBLIC_ISSUER;
  }

  /** Anonymous `GET auth/sso/:tenantSlug` — lets the login page decide whether to render the button. */
  async getPublicStatus(tenantSlug: string): Promise<{
    enabled: boolean;
    provider?: string;
    enforceSso?: boolean;
    buttonLabel?: string;
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) return { enabled: false };
    const config = await this.ssoConfig.getRaw(tenant.id);
    if (!config || !config.enabled) return { enabled: false };
    return {
      enabled: true,
      provider: config.provider,
      enforceSso: config.enforceSso,
      buttonLabel: `Continue with ${PROVIDER_LABEL[config.provider]}`,
    };
  }

  async startLogin(tenantSlug: string, redirectTo?: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });
    if (!tenant) throw new SsoError('sso_not_configured');

    const config = await this.ssoConfig.getRaw(tenant.id);
    if (!config || !config.enabled) throw new SsoError('sso_not_configured');

    if (redirectTo && !redirectTo.startsWith(this.appBaseUrl)) {
      throw new SsoError('invalid_redirect');
    }

    let oidcConfig: client.Configuration;
    try {
      oidcConfig = await this.oidcClientFactory.buildClient(tenant.id);
    } catch {
      throw new SsoError('idp_unreachable');
    }

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const stored: StoredAuthRequest = {
      tenantId: tenant.id,
      tenantSlug,
      provider: config.provider,
      codeVerifier,
      nonce,
      redirectTo,
    };
    await this.redis.set(
      `${STATE_KEY_PREFIX}${state}`,
      JSON.stringify(stored),
      'EX',
      this.stateTtlSeconds,
    );

    const authUrl = client.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: this.callbackUrl,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return this.rewriteForBrowser(authUrl, config.provider);
  }

  /** mock-oauth2-server derives every endpoint from the Host header of the discovery
   * request; the API discovers over the compose network (FAKE_OIDC_ISSUER), so the
   * authorization_endpoint it returns must be rewritten to the browser-reachable
   * FAKE_OIDC_PUBLIC_ISSUER before the browser is sent there. */
  private rewriteForBrowser(url: URL, provider: string): string {
    if (provider !== 'fake') return url.href;
    return url.href.replace(this.fakeOidcIssuer, this.fakeOidcPublicIssuer);
  }

  async handleCallback(
    callbackUrl: URL,
    ip?: string,
  ): Promise<{ redirectUrl: string }> {
    const state = callbackUrl.searchParams.get('state');
    const idpError = callbackUrl.searchParams.get('error');

    if (!state) throw new SsoError('state_mismatch');

    const raw = await this.redis.get(`${STATE_KEY_PREFIX}${state}`);
    await this.redis.del(`${STATE_KEY_PREFIX}${state}`); // single-use regardless of outcome
    if (!raw) throw new SsoError('state_mismatch');
    const stored: StoredAuthRequest = JSON.parse(raw);

    if (idpError) {
      this.rejectEvent(stored, 'idp_error', ip);
      throw new SsoError('idp_error', idpError);
    }

    let oidcConfig: client.Configuration;
    try {
      oidcConfig = await this.oidcClientFactory.buildClient(stored.tenantId);
    } catch {
      throw new SsoError('idp_unreachable');
    }

    let tokens: client.TokenEndpointResponse &
      client.TokenEndpointResponseHelpers;
    try {
      tokens = await client.authorizationCodeGrant(oidcConfig, callbackUrl, {
        pkceCodeVerifier: stored.codeVerifier,
        expectedNonce: stored.nonce,
        expectedState: state,
        idTokenExpected: true,
      });
    } catch (err) {
      this.logger.warn(`SSO token exchange failed: ${(err as Error).message}`);
      throw new SsoError('idp_unreachable');
    }

    const claims = tokens.claims();
    if (!claims || claims.email_verified !== true) {
      this.rejectEvent(stored, 'email_unverified', ip);
      throw new SsoError('email_unverified');
    }
    const email = String(claims.email);
    const domain = email.split('@')[1]?.toLowerCase() ?? '';

    const ssoConfig = (await this.ssoConfig.getRaw(stored.tenantId))!;
    const result = await this.accountLinker.resolve(
      stored.tenantId,
      stored.provider,
      { sub: String(claims.sub), email, domain },
      {
        allowedDomains: ssoConfig.allowedDomains,
        jitProvisioning: ssoConfig.jitProvisioning,
        jitDefaultRole: ssoConfig.jitDefaultRole,
      },
    );

    if (result.outcome === 'rejected') {
      this.rejectEvent(stored, result.reason, ip, domain);
      throw new SsoError(result.reason);
    }

    const amr: string[] = [`oidc:${stored.provider}`];
    const idpAmr = Array.isArray(claims.amr) ? (claims.amr as string[]) : [];
    const idpAcr = typeof claims.acr === 'string' ? claims.acr : undefined;
    if (idpAmr.includes('mfa') || idpAmr.includes('hwk') || idpAcr) {
      amr.push('mfa');
    }

    const login = await this.completeLogin(result.userId, stored.tenantId, amr);

    this.eventEmitter.emit('sso.login', {
      tenantId: stored.tenantId,
      userId: result.userId,
      provider: stored.provider,
      membershipCreated: result.membershipCreated,
      amr,
      ip,
    });
    await this.auditService.record({
      tenantId: stored.tenantId,
      actor: { type: 'user', id: result.userId, ip },
      action: 'sso.login',
      target: { type: 'tenant', id: stored.tenantId },
      payload: {
        provider: stored.provider,
        membershipCreated: result.membershipCreated,
        amr,
      },
    });

    const code = crypto.randomBytes(24).toString('hex');
    await this.redis.set(
      `${COMPLETE_KEY_PREFIX}${code}`,
      JSON.stringify(login),
      'EX',
      COMPLETE_TTL_SECONDS,
    );

    const redirectUrl = new URL('/sso/complete', this.appBaseUrl);
    redirectUrl.searchParams.set('code', code);
    if (stored.redirectTo)
      redirectUrl.searchParams.set('redirectTo', stored.redirectTo);
    return { redirectUrl: redirectUrl.href };
  }

  /** Exchanges the one-time code from the callback redirect for real tokens.
   * Single-use, 60s TTL — never carries tokens in a URL, which browser history,
   * referrers and access logs would otherwise capture. */
  async completeExchange(code: string): Promise<CompletedLogin | null> {
    const key = `${COMPLETE_KEY_PREFIX}${code}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw) as CompletedLogin;
  }

  private async completeLogin(
    userId: string,
    tenantId: string,
    amr: string[],
  ): Promise<CompletedLogin> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_tenantId: { userId, tenantId } },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    const refreshToken = this.tokenService.generateRefreshToken();
    const { id: sessionId } = await this.tokenService.createSession(
      userId,
      tenantId,
      refreshToken,
    );
    // amr isn't part of TokenService.createSession's signature (E02 owns that
    // file) — set directly on the row it just created instead of extending it.
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { amr },
    });

    const accessToken = await this.tokenService.issueAccessToken({
      userId,
      tenantId,
      role: membership.role,
      platformRole: user.platformRole ?? undefined,
      sessionId,
    });

    const memberships = await this.getMemberships(userId);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenTtlSeconds(),
      user: toSafeUser(user),
      memberships,
      activeTenantId: tenantId,
      activeRole: membership.role,
    };
  }

  private async getMemberships(userId: string) {
    const rows = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
    return rows.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      role: m.role,
    }));
  }

  private rejectEvent(
    stored: StoredAuthRequest,
    reason: string,
    ip?: string,
    emailDomain?: string,
  ) {
    this.eventEmitter.emit('sso.login_rejected', {
      tenantId: stored.tenantId,
      provider: stored.provider,
      emailDomain,
      reason,
      ip,
    });
    this.auditService
      .record({
        tenantId: stored.tenantId,
        actor: { type: 'system', ip },
        action: 'sso.login_rejected',
        target: { type: 'tenant', id: stored.tenantId },
        payload: { provider: stored.provider, emailDomain, reason },
      })
      .catch(() => {
        // Best-effort — a failure to audit a rejection must not surface as
        // the reason the login itself failed.
      });
  }
}

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  fake: 'SSO',
};
