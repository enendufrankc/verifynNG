import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PrismaClient,
  SsoProvider,
  type TenantSsoConfig,
} from '@prisma/client';
import { loadEnv } from '@verifynng/config';
import { AuditService } from '../audit/audit.service.js';
import { decryptSecret, encryptSecret } from './sso-crypto.util.js';
import {
  SSO_ENTITLEMENT_PORT,
  type SsoEntitlementPort,
} from './entitlement.port.js';

export interface UpsertSsoConfigDto {
  provider: SsoProvider;
  clientId: string;
  clientSecret?: string;
  issuer?: string;
  allowedDomains?: string[];
  jitProvisioning?: boolean;
  jitDefaultRole?: 'viewer' | 'operator';
  enforceSso?: boolean;
}

export interface SafeSsoConfig {
  enabled: boolean;
  provider?: SsoProvider;
  clientId?: string;
  clientSecretLast4?: string;
  issuer?: string | null;
  allowedDomains?: string[];
  jitProvisioning?: boolean;
  jitDefaultRole?: string;
  enforceSso?: boolean;
  lastTestedAt?: Date | null;
  lastTestResult?: string | null;
}

@Injectable()
export class SsoConfigService {
  private readonly encKey: Buffer;
  private readonly nodeEnv: string;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
    @Inject(SSO_ENTITLEMENT_PORT)
    private readonly entitlement: SsoEntitlementPort,
  ) {
    const env = loadEnv();
    this.encKey = Buffer.from(env.SSO_CLIENT_SECRET_ENC_KEY, 'hex');
    this.nodeEnv = env.NODE_ENV;
  }

  async get(tenantId: string): Promise<SafeSsoConfig> {
    const config = await this.prisma.tenantSsoConfig.findUnique({
      where: { tenantId },
    });
    if (!config) return { enabled: false };
    return this.toSafeConfig(config);
  }

  /** Raw config for internal callers (OidcClientFactory, login flow) — never exposed over HTTP. */
  async getRaw(tenantId: string) {
    return this.prisma.tenantSsoConfig.findUnique({ where: { tenantId } });
  }

  decryptClientSecret(config: TenantSsoConfig): string {
    return decryptSecret(config.clientSecretEnc, this.encKey);
  }

  async upsert(
    tenantId: string,
    actorId: string | undefined,
    actorIp: string | undefined,
    dto: UpsertSsoConfigDto,
  ): Promise<SafeSsoConfig> {
    const allowed = await this.entitlement.hasFeature(tenantId, 'sso');
    if (!allowed) {
      throw new HttpException(
        { code: 'plan_limit', feature: 'sso' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    if (dto.provider === 'fake' && this.nodeEnv === 'production') {
      throw new BadRequestException(
        'The fake provider is not available in production',
      );
    }
    if (!['google', 'microsoft', 'fake'].includes(dto.provider)) {
      throw new BadRequestException('Unknown provider');
    }
    if (
      dto.jitDefaultRole &&
      !['viewer', 'operator'].includes(dto.jitDefaultRole)
    ) {
      throw new BadRequestException(
        'jitDefaultRole must be viewer or operator',
      );
    }

    const existing = await this.prisma.tenantSsoConfig.findUnique({
      where: { tenantId },
    });

    const allowedDomains = (dto.allowedDomains ?? []).map((d) =>
      d.trim().toLowerCase(),
    );

    const changes: string[] = [];
    const track = (field: string, next: unknown, prev: unknown) => {
      if (JSON.stringify(next) !== JSON.stringify(prev)) changes.push(field);
    };
    track('provider', dto.provider, existing?.provider);
    track('clientId', dto.clientId, existing?.clientId);
    track('issuer', dto.issuer ?? null, existing?.issuer ?? null);
    track('allowedDomains', allowedDomains, existing?.allowedDomains ?? []);
    track(
      'jitProvisioning',
      dto.jitProvisioning ?? false,
      existing?.jitProvisioning ?? false,
    );
    track(
      'jitDefaultRole',
      dto.jitDefaultRole ?? 'viewer',
      existing?.jitDefaultRole ?? 'viewer',
    );
    track('enforceSso', dto.enforceSso ?? false, existing?.enforceSso ?? false);
    if (dto.clientSecret) changes.push('clientSecret');

    const clientSecretEnc = dto.clientSecret
      ? encryptSecret(dto.clientSecret, this.encKey)
      : existing?.clientSecretEnc;
    if (!clientSecretEnc) {
      throw new BadRequestException('clientSecret is required');
    }

    const saved = await this.prisma.tenantSsoConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: dto.provider,
        clientId: dto.clientId,
        clientSecretEnc,
        issuer: dto.issuer,
        allowedDomains,
        jitProvisioning: dto.jitProvisioning ?? false,
        jitDefaultRole: dto.jitDefaultRole ?? 'viewer',
        enforceSso: dto.enforceSso ?? false,
        enabled: true,
      },
      update: {
        provider: dto.provider,
        clientId: dto.clientId,
        clientSecretEnc,
        issuer: dto.issuer,
        allowedDomains,
        jitProvisioning: dto.jitProvisioning ?? false,
        jitDefaultRole: dto.jitDefaultRole ?? 'viewer',
        enforceSso: dto.enforceSso ?? false,
        enabled: true,
      },
    });

    await this.recordChange(
      tenantId,
      actorId,
      actorIp,
      changes,
      saved.enforceSso,
    );

    return this.toSafeConfig(saved);
  }

  async disable(
    tenantId: string,
    actorId: string | undefined,
    actorIp: string | undefined,
  ): Promise<void> {
    const existing = await this.prisma.tenantSsoConfig.findUnique({
      where: { tenantId },
    });
    if (!existing) throw new NotFoundException('SSO is not configured');

    await this.prisma.tenantSsoConfig.update({
      where: { tenantId },
      data: { enabled: false, enforceSso: false },
    });

    const changes = ['enabled'];
    if (existing.enforceSso) changes.push('enforceSso');
    await this.recordChange(tenantId, actorId, actorIp, changes, false);
  }

  private async recordChange(
    tenantId: string,
    actorId: string | undefined,
    actorIp: string | undefined,
    changes: string[],
    enforceSso: boolean,
  ) {
    await this.auditService.record({
      tenantId,
      actor: { type: actorId ? 'user' : 'system', id: actorId, ip: actorIp },
      action: 'sso.config.changed',
      target: { type: 'tenant', id: tenantId },
      // Field names only — never values (client secret, allowed domains,
      // etc. never appear in the audit trail).
      payload: { changes, enforceSso },
    });
    this.eventEmitter.emit('sso.config.changed', {
      tenantId,
      actorId,
      changes,
      enforceSso,
    });
  }

  private toSafeConfig(config: TenantSsoConfig): SafeSsoConfig {
    let clientSecretLast4: string | undefined;
    try {
      clientSecretLast4 = this.decryptClientSecret(config).slice(-4);
    } catch {
      clientSecretLast4 = undefined;
    }
    return {
      enabled: config.enabled,
      provider: config.provider,
      clientId: config.clientId,
      clientSecretLast4,
      issuer: config.issuer,
      allowedDomains: config.allowedDomains,
      jitProvisioning: config.jitProvisioning,
      jitDefaultRole: config.jitDefaultRole,
      enforceSso: config.enforceSso,
      lastTestedAt: config.lastTestedAt,
      lastTestResult: config.lastTestResult,
    };
  }
}
