import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaClient, Batch, Unit, BatchArtefact } from '@prisma/client';

@Injectable()
export class BatchesService {
  constructor(@Inject('PRISMA') private prisma: PrismaClient) {}

  async list(
    tenantId: string,
    opts?: { status?: string; productId?: string; cursor?: string },
  ): Promise<Batch[]> {
    const where: Record<string, unknown> = { tenantId };
    if (opts?.status) where.status = opts.status;
    if (opts?.productId) where.productId = opts.productId;

    const batches = await this.prisma.batch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      cursor: opts?.cursor ? { id: opts.cursor } : undefined,
      skip: opts?.cursor ? 1 : 0,
    });
    return batches;
  }

  async get(
    tenantId: string,
    batchId: string,
  ): Promise<
    Batch & { progress: { minted: number; total: number; percent: number } }
  > {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
      include: { product: true, oem: true, artefacts: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');

    const percent =
      batch.count > 0 ? Math.round((batch.mintedCount / batch.count) * 100) : 0;
    return {
      ...batch,
      progress: { minted: batch.mintedCount, total: batch.count, percent },
    };
  }

  async getUnitsPage(
    tenantId: string,
    batchId: string,
    cursor?: string,
    limit = 100,
  ): Promise<
    Pick<Unit, 'id' | 'serial' | 'tier1Code' | 'state' | 'createdAt'>[]
  > {
    const units = await this.prisma.unit.findMany({
      where: { tenantId, batchId },
      orderBy: { serial: 'asc' },
      take: limit,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      select: {
        id: true,
        serial: true,
        tier1Code: true,
        state: true,
        createdAt: true,
      },
    });
    return units;
  }

  async getDownloads(
    tenantId: string,
    batchId: string,
  ): Promise<BatchArtefact[]> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, tenantId },
      include: { artefacts: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch.artefacts;
  }
}
