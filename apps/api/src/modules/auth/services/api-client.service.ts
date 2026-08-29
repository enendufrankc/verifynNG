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
   * Seed platform-level ApiClients from INTERNAL_API_KEYS env.
   * Format: "name:rawkey,name:rawkey"
   * Idempotent — uses upsert by keyHash.
   */
  async seedInternalClients() {
    const env = loadEnv();
    const internalApiKeys = env.INTERNAL_API_KEYS;
    if (!internalApiKeys) return;

    const entries = internalApiKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) continue;
      const name = entry.slice(0, colonIdx).trim();
      const rawKey = entry.slice(colonIdx + 1).trim();
      if (!name || !rawKey) continue;

      const keyHash = hashForStorage(rawKey);
      const keyPrefix = rawKey.slice(0, 8);

      try {
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
      } catch {
        // Skip if somehow conflicts
      }
    }
  }
}
