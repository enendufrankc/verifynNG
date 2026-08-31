import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as client from 'openid-client';
import { loadEnv } from '@verifynng/config';
import { SsoConfigService } from './sso-config.service';

export interface SsoTestResult {
  ok: boolean;
  issuer?: string;
  authorizationEndpoint?: string;
  emailVerifiedClaimAvailable?: boolean;
  error?: string;
}

/**
 * Builds and caches an `openid-client` Configuration per tenant. Cache is
 * invalidated whenever `SsoConfigService` emits `sso.config.changed` — see
 * that event's payload for what changed.
 */
@Injectable()
export class OidcClientFactory {
  private readonly cache = new Map<string, client.Configuration>();
  private readonly nodeEnv: string;
  private readonly discoveryTimeoutSeconds: number;
  private readonly fakeOidcIssuer: string;

  constructor(private readonly ssoConfig: SsoConfigService) {
    const env = loadEnv();
    this.nodeEnv = env.NODE_ENV;
    this.discoveryTimeoutSeconds = env.SSO_DISCOVERY_TIMEOUT_MS / 1000;
    this.fakeOidcIssuer = env.FAKE_OIDC_ISSUER;
  }

  @OnEvent('sso.config.changed')
  onConfigChanged(payload: { tenantId: string }) {
    this.invalidate(payload.tenantId);
  }

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  async buildClient(tenantId: string): Promise<client.Configuration> {
    const cached = this.cache.get(tenantId);
    if (cached) return cached;

    const raw = await this.ssoConfig.getRaw(tenantId);
    if (!raw || !raw.enabled) {
      throw new NotFoundException('SSO is not configured for this tenant');
    }

    const config = await this.discover(
      raw.provider,
      raw.clientId,
      this.ssoConfig.decryptClientSecret(raw),
      raw.issuer,
    );
    this.cache.set(tenantId, config);
    return config;
  }

  private async discover(
    provider: 'google' | 'microsoft' | 'fake',
    clientId: string,
    clientSecret: string,
    issuer: string | null,
  ): Promise<client.Configuration> {
    if (provider === 'fake') {
      // Compile-time fence: a `fake` config can exist in the DB (nothing
      // stops a stale row), but it must never be usable to actually build a
      // client once the process is running in production.
      if (this.nodeEnv === 'production') {
        throw new Error('The fake SSO provider is not available in production');
      }
      const base = issuer ?? this.fakeOidcIssuer;
      // mock-oauth2-server derives every URL it returns (issuer,
      // authorization_endpoint, ...) from the Host header of whichever
      // request reached it — discovering via FAKE_OIDC_ISSUER (the
      // compose-network hostname the API uses) yields a self-consistent
      // metadata document, so no issuer-mismatch workaround is needed here.
      // The one URL that *does* need rewriting is the authorization_endpoint
      // handed to the browser (T3's SsoLoginService, using
      // FAKE_OIDC_PUBLIC_ISSUER) — the browser can't resolve `fake-oidc`.
      return client.discovery(
        new URL(base),
        clientId,
        clientSecret,
        undefined,
        {
          execute: [client.allowInsecureRequests],
          timeout: this.discoveryTimeoutSeconds,
        },
      );
    }

    if (provider === 'google') {
      return client.discovery(
        new URL('https://accounts.google.com'),
        clientId,
        clientSecret,
        undefined,
        { timeout: this.discoveryTimeoutSeconds },
      );
    }

    if (provider === 'microsoft') {
      if (!issuer) {
        throw new BadRequestException(
          'issuer (the Entra tenant id, or a full authority URL) is required for microsoft',
        );
      }
      const authority = issuer.startsWith('http')
        ? issuer
        : `https://login.microsoftonline.com/${issuer}/v2.0`;
      return client.discovery(
        new URL(authority),
        clientId,
        clientSecret,
        undefined,
        { timeout: this.discoveryTimeoutSeconds },
      );
    }

    throw new BadRequestException(`Unsupported provider ${provider}`);
  }

  async testConnection(tenantId: string): Promise<SsoTestResult> {
    this.invalidate(tenantId);
    try {
      const config = await this.buildClient(tenantId);
      const meta = config.serverMetadata();
      const result: SsoTestResult = {
        ok: true,
        issuer: meta.issuer,
        authorizationEndpoint: meta.authorization_endpoint,
        emailVerifiedClaimAvailable:
          meta.claims_supported?.includes('email_verified') ?? undefined,
      };
      await this.ssoConfig.recordTestResult(tenantId, true, 'ok');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await this.ssoConfig.recordTestResult(tenantId, false, message);
      return { ok: false, error: message };
    }
  }
}
