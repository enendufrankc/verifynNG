import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashForStorage } from '@verifynng/core';
import crypto from 'node:crypto';
import { loadEnv } from '@verifynng/config';

@Injectable()
export class ApiClientService {
  constructor(private prisma: PrismaClient) {}

  async create(name: string, tenantId?: string, scopes: string[] = []) {
    const prefixBytes = crypto.randomBytes(4).toString('hex');
    const secretBytes = crypto.randomBytes(32).toString('hex');
    const rawKey = `vk_${prefixBytes}_${secretBytes}`;
    const keyHash = hashForStorage(rawKey);
    const keyPrefix = rawKey.slice(0, 8);

    const client = await this.prisma.apiClient.create({
      data: { tenantId: tenantId ?? null, name, keyHash, keyPrefix, scopes },
    });

    return { id: client.id, rawKey };
  }

  async verify(rawKey: string) {
    const keyHash = hashForStorage(rawKey);
    const client = await this.prisma.apiClient.findUnique({
      where: { keyHash },
    });
    if (!client || client.revokedAt) {
      throw new UnauthorizedException();
    }

    // Update lastUsedAt (fire-and-forget)
    await this.prisma.apiClient
      .update({
        where: { id: client.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      apiClientId: client.id,
      tenantId: client.tenantId,
      scopes: client.scopes,
    };
  }

  async revoke(id: string) {
    await this.prisma.apiClient.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Seed the four platform-level ApiClients (worker, fake-sms, fake-pay, fake-geo) from their
   * dedicated env vars (see docker/.env.compose). Idempotent — upserts by keyHash.
   */
  async seedInternalClients() {
    const env = loadEnv();
    const platformClients: Record<string, string> = {
      worker: env.WORKER_KEY,
      'fake-sms': env.FAKE_SMS_KEY,
      'fake-pay': env.FAKE_PAY_KEY,
      'fake-geo': env.FAKE_GEO_KEY,
    };

    for (const [name, rawKey] of Object.entries(platformClients)) {
      if (!rawKey) continue;

      const keyHash = hashForStorage(rawKey);
      const keyPrefix = rawKey.slice(0, 8);

      await this.prisma.apiClient.upsert({
        where: { keyHash },
        update: {},
        create: {
          name,
          keyHash,
          keyPrefix,
          scopes: ['internal'],
        },
      });
    }
  }
}
