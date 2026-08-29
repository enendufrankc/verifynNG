import {
  Injectable,
  Inject,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
// 'batch-exports' queue is registered in BullMQModule and re-exported, so
// it is available to inject here without an extra module import.
import { PrismaClient, Batch } from '@prisma/client';
import {
  generateCode,
  hashForStorage,
  deriveBatchWatermark,
  StaticKeyRing,
  type Tier,
} from '@verifynng/core';
import { loadEnv } from '@verifynng/config';
import {
  ENTITLEMENT_POLICY,
  type EntitlementPolicy,
} from './entitlement.policy';
import { ManifestService } from './manifest.service';
import { EventsService } from '../../common/events.service';

@Injectable()
export class MintService {
  private ring: StaticKeyRing;

  constructor(
    @Inject('PRISMA') private prisma: PrismaClient,
    @Inject(ENTITLEMENT_POLICY) private entitlementPolicy: EntitlementPolicy,
    private manifestService: ManifestService,
    private events: EventsService,
    @InjectQueue('mint') private mintQueue: Queue,
    @InjectQueue('batch-exports') private exportsQueue: Queue,
  ) {
    const env = loadEnv();
    this.ring = new StaticKeyRing(env.CORE_KEYS, env.CORE_ACTIVE_KID);
  }

  async mint(params: {
    tenantId: string;
    productId: string;
    oemId: string;
    count: number;
    idempotencyKey: string;
    requestedBy: string;
    note?: string;
  }): Promise<{ batch: Batch; mode: 'sync' | 'job'; jobId?: string }> {
    const {
      tenantId,
      productId,
      oemId,
      count,
      idempotencyKey,
      requestedBy,
      note,
    } = params;
    const env = loadEnv();

    // Idempotency: check existing batch
    const existing = await this.prisma.batch.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing) {
      if (
        existing.productId !== productId ||
        existing.oemId !== oemId ||
        existing.count !== count
      ) {
        throw new ConflictException('idempotency_key_conflict');
      }
      return {
        batch: existing,
        mode: existing.jobId ? 'job' : 'sync',
        jobId: existing.jobId ?? undefined,
      };
    }

    // Entitlement check
    const existingUnits = await this.prisma.unit.count({ where: { tenantId } });
    const entitlement = await this.entitlementPolicy.canMint({
      tenantId,
      count,
      existingUnitsThisYear: existingUnits,
    });
    if (!entitlement.allowed) {
      // E04 spec says 402 for entitlement denial
      throw new HttpException(
        {
          error: 'entitlement',
          reason: entitlement.reason,
          upgradeHint: entitlement.upgradeHint,
        },
        402,
      );
    }

    // Validate product and OEM exist
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) throw new ConflictException('product_not_found');
    const oem = await this.prisma.oem.findFirst({
      where: { id: oemId, tenantId },
    });
    if (!oem) throw new ConflictException('oem_not_found');

    // Create batch row with placeholder watermark, then derive the real one
    const batch = await this.prisma.batch.create({
      data: {
        tenantId,
        productId,
        oemId,
        count,
        idempotencyKey,
        requestedBy,
        note,
        status: 'minting',
        watermark: '', // placeholder, updated below
        kid: this.ring.active().kid,
      },
    });

    const watermark = deriveBatchWatermark(this.ring, {
      tenant: tenantId,
      batchId: batch.id,
    });
    await this.prisma.batch.update({
      where: { id: batch.id },
      data: { watermark },
    });

    const chunkSize = env.MINT_CHUNK;
    const syncMax = env.MINT_SYNC_MAX;
    const isJob = count > syncMax;

    if (isJob) {
      const job = await this.mintQueue.add(
        'mint',
        {
          tenantId,
          batchId: batch.id,
          count,
        },
        {
          jobId: `${tenantId}:${idempotencyKey}`,
          removeOnComplete: true,
        },
      );
      await this.prisma.batch.update({
        where: { id: batch.id },
        data: { jobId: job.id?.toString() ?? undefined },
      });
      return { batch, mode: 'job', jobId: job.id?.toString() };
    }

    // Synchronous mint — tier2Codes held in memory ONLY for the manifest
    const tier2Codes: string[] = [];
    let mintedCount = 0;

    for (let chunkStart = 0; chunkStart < count; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, count);
      const chunkNumber = Math.floor(chunkStart / chunkSize);

      const units: Array<{
        tenantId: string;
        batchId: string;
        tier1Code: string;
        tier2Hash: string;
        serial: number;
        productId: string;
      }> = [];
      for (let i = chunkStart; i < chunkEnd; i++) {
        const serial = i + 1;
        const { code: tier1Code } = generateCode(this.ring, {
          tenant: tenantId,
          tier: 1 as Tier,
        });
        const { code: tier2Code } = generateCode(this.ring, {
          tenant: tenantId,
          tier: 2 as Tier,
        });
        const tier2Hash = hashForStorage(tier2Code);
        tier2Codes.push(tier2Code);
        units.push({
          tenantId,
          batchId: batch.id,
          tier1Code,
          tier2Hash,
          serial,
          productId,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.unit.createMany({ data: units, skipDuplicates: true });
      });

      mintedCount += chunkEnd - chunkStart;
      await this.prisma.batch.update({
        where: { id: batch.id },
        data: { mintedCount, lastChunk: chunkNumber + 1 },
      });

      await this.events.emit('batch.mint.progress', {
        tenantId,
        batchId: batch.id,
        minted: mintedCount,
        total: count,
      });
    }

    const mintedBatch = await this.prisma.batch.update({
      where: { id: batch.id },
      data: { status: 'minted', mintedAt: new Date() },
    });

    await this.events.emit('batch.minted', {
      tenantId,
      batchId: batch.id,
      productId,
      oemId,
      count,
      watermark,
      kid: this.ring.active().kid,
      at: new Date(),
    });

    // Generate manifest (holds tier2Codes in memory, then encrypts and clears)
    const { objectKey, sha256 } = await this.manifestService.generate(
      batch.id,
      tier2Codes,
    );

    // Clear tier2Codes from memory
    tier2Codes.length = 0;

    await this.events.emit('manifest.generated', {
      tenantId,
      batchId: batch.id,
      objectKey,
      sha256,
      at: new Date(),
    });

    // Kick off exports generation (QR ZIP, CSV, PDF, all-zip).
    await this.exportsQueue.add(
      'batch-exports',
      { tenantId, batchId: batch.id },
      { removeOnComplete: true },
    );

    return { batch: mintedBatch, mode: 'sync' };
  }
}
