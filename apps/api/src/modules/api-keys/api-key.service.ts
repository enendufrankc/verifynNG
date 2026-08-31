import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, ApiKey } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import crypto from 'node:crypto';
import {
  ENTITLEMENT_SERVICE,
  type EntitlementService,
} from '../entitlements/entitlement.service.js';
import {
  generateApiKey,
  hashApiKey,
  type ApiKeyMode,
} from './key-generator.js';

export interface VerifiedApiKey {
  keyId: string;
  tenantId: string;
  scopes: string[];
  mode: ApiKeyMode;
}

/** Fields safe to return to the console — never `hash`. */
export type ApiKeySummary = Omit<ApiKey, 'hash'>;

const LAST_USED_THROTTLE_MS = 60_000;

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventEmitter: EventEmitter2,
    @Inject(ENTITLEMENT_SERVICE)
    private readonly entitlements: EntitlementService,
  ) {}

  async create(
    tenantId: string,
    opts: {
      name: string;
      scopes: string[];
      mode?: ApiKeyMode;
      expiresAt?: Date;
      createdById: string;
    },
  ): Promise<{ key: string; record: ApiKeySummary }> {
    const hasFeature = await this.entitlements.hasFeature(
      tenantId,
      'publicApi',
    );
    if (!hasFeature) {
      throw new HttpException(
        { error: 'plan_limit', reason: 'publicApi is not on this plan' },
        402,
      );
    }

    const { maxApiKeys } = await this.entitlements.limitsFor(tenantId);
    const activeCount = await this.prisma.apiKey.count({
      where: { tenantId, revokedAt: null },
    });
    if (activeCount >= maxApiKeys) {
      throw new HttpException(
        {
          error: 'plan_limit',
          reason: `Plan allows at most ${maxApiKeys} active API keys`,
          upgradeHint: 'Upgrade your plan for more keys',
        },
        402,
      );
    }

    const mode = opts.mode ?? 'live';
    const { rawKey, prefix } = generateApiKey(mode);
    const hash = hashApiKey(rawKey);

    const record = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name: opts.name,
        prefix,
        hash,
        mode,
        scopes: opts.scopes,
        createdById: opts.createdById,
        expiresAt: opts.expiresAt,
      },
    });

    this.eventEmitter.emit('apikey.created', {
      tenantId,
      apiKeyId: record.id,
      prefix,
      scopes: record.scopes,
      createdBy: opts.createdById,
    });

    return { key: rawKey, record: this.omitHash(record) };
  }

  /**
   * Looks up the key by its prefix (unique-indexed, so this already resolves
   * to at most one row) then constant-time-compares the full hash before
   * trusting it — the prefix alone is not sufficient proof of possession.
   */
  async verify(rawKey: string): Promise<VerifiedApiKey | null> {
    if (!rawKey.startsWith('vk_live_') && !rawKey.startsWith('vk_test_')) {
      return null;
    }
    const prefix = rawKey.slice(0, 12);
    const record = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (!record) return null;

    const candidateHash = Buffer.from(hashApiKey(rawKey));
    const storedHash = Buffer.from(record.hash);
    if (
      candidateHash.length !== storedHash.length ||
      !crypto.timingSafeEqual(candidateHash, storedHash)
    ) {
      return null;
    }

    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      return null;
    }

    void this.touchLastUsed(record.id, record.lastUsedAt);

    return {
      keyId: record.id,
      tenantId: record.tenantId,
      scopes: record.scopes,
      mode: record.mode as ApiKeyMode,
    };
  }

  /** Updates at most once a minute per key to avoid write amplification. */
  async touchLastUsed(id: string, lastUsedAt: Date | null): Promise<void> {
    if (
      lastUsedAt &&
      Date.now() - lastUsedAt.getTime() < LAST_USED_THROTTLE_MS
    ) {
      return;
    }
    await this.prisma.apiKey
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined); // best-effort; never fail a request over this
  }

  async list(tenantId: string): Promise<ApiKeySummary[]> {
    const records = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.omitHash(r));
  }

  async get(tenantId: string, id: string): Promise<ApiKeySummary> {
    const record = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new NotFoundException();
    return this.omitHash(record);
  }

  async revoke(tenantId: string, id: string, revokedBy: string): Promise<void> {
    const record = await this.prisma.apiKey.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new NotFoundException();
    if (record.revokedAt) throw new ConflictException('already revoked');

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    this.eventEmitter.emit('apikey.revoked', {
      tenantId,
      apiKeyId: id,
      prefix: record.prefix,
      revokedBy,
    });
  }

  private omitHash(record: ApiKey): ApiKeySummary {
    const { hash: _hash, ...rest } = record;
    void _hash;
    return rest;
  }
}
