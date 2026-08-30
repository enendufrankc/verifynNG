import { Inject, Injectable } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaClient } from '@prisma/client';
import {
  generateCode,
  hashForStorage,
  deriveBatchWatermark,
  StaticKeyRing,
  type Tier,
} from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import { ManifestService } from '../modules/batches/manifest.service';
import { EventsService } from '../common/events.service';

const MAX_COLLISION_RETRIES = 5;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Processor('mint', { concurrency: 2 })
@Injectable()
export class MintProcessor extends WorkerHost {
  private ring: StaticKeyRing;

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    private manifestService: ManifestService,
    private events: EventsService,
    @InjectQueue('batch-exports') private exportsQueue: Queue,
  ) {
    super();
    const env = loadEnv();
    this.ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
  }

  async process(
    job: Job<{ tenantId: string; batchId: string; count: number }>,
  ): Promise<void> {
    const { tenantId, batchId, count } = job.data;
    const tenantSlug = (
      await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { slug: true },
      })
    ).slug;
    const env = loadEnv();
    const chunkSize = env.MINT_CHUNK;

    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch || batch.status !== 'minting') return;

    // Resume from lastChunk
    const startSerial = batch.lastChunk * chunkSize;
    const tier2Codes: string[] = [];

    for (
      let chunkStart = startSerial;
      chunkStart < count;
      chunkStart += chunkSize
    ) {
      const chunkEnd = Math.min(chunkStart + chunkSize, count);
      const chunkNumber = Math.floor(chunkStart / chunkSize);

      let inserted = false;
      let lastCollision: unknown;
      for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
        const units: Array<{
          tenantId: string;
          batchId: string;
          tier1Code: string;
          tier2Hash: string;
          serial: number;
          productId: string;
        }> = [];
        const chunkTier2Codes: string[] = [];
        for (let i = chunkStart; i < chunkEnd; i++) {
          const serial = i + 1;
          const { code: tier1Code } = generateCode(this.ring, {
            tenant: tenantSlug,
            tier: 1 as Tier,
            watermark: batch.watermark,
          });
          const { code: tier2Code } = generateCode(this.ring, {
            tenant: tenantSlug,
            tier: 2 as Tier,
            watermark: batch.watermark,
          });
          chunkTier2Codes.push(tier2Code);
          units.push({
            tenantId,
            batchId,
            tier1Code,
            tier2Hash: hashForStorage(tier2Code),
            serial,
            productId: batch.productId,
          });
        }

        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.unit.createMany({ data: units });
          });
          tier2Codes.push(...chunkTier2Codes);
          inserted = true;
          break;
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          lastCollision = error;
        }
      }
      if (!inserted) throw lastCollision;

      const mintedCount = chunkEnd;
      await this.prisma.batch.update({
        where: { id: batchId },
        data: { mintedCount, lastChunk: chunkNumber + 1 },
      });

      const progress = Math.round((mintedCount / count) * 100);
      await job.updateProgress(progress);

      await this.events.emit('batch.mint.progress', {
        tenantId,
        batchId,
        minted: mintedCount,
        total: count,
      });
    }

    const watermark = deriveBatchWatermark(this.ring, {
      tenant: tenantSlug,
      batchId,
    });
    await this.prisma.batch.update({
      where: { id: batchId },
      data: { status: 'minted', mintedAt: new Date(), watermark },
    });

    await this.events.emit('batch.minted', {
      tenantId,
      batchId,
      productId: batch.productId,
      oemId: batch.oemId,
      count,
      watermark,
      kid: this.ring.active().kid,
      at: new Date(),
    });

    // Generate manifest
    const { objectKey, sha256 } = await this.manifestService.generate(
      batchId,
      tier2Codes,
    );
    tier2Codes.length = 0;

    await this.events.emit('manifest.generated', {
      tenantId,
      batchId,
      objectKey,
      sha256,
      at: new Date(),
    });

    // Kick off exports generation (QR ZIP, CSV, PDF, all-zip).
    await this.exportsQueue.add(
      'batch-exports',
      { tenantId, batchId },
      { removeOnComplete: true },
    );
  }

  // Units written before the failure stay — the batch remains inspectable —
  // but no manifest or exports are generated for a failed batch.
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<{ tenantId: string; batchId: string; count: number }> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job?.data?.batchId) return;
    await this.prisma.batch.update({
      where: { id: job.data.batchId },
      data: { status: 'failed', failedReason: error.message },
    });
  }
}
