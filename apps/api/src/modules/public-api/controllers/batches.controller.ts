import { Get, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ListBatchesQueryDto } from '../dto/list-batches-query.dto.js';
import { ListBatchUnitsQueryDto } from '../dto/list-batch-units-query.dto.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import { toPublicBatch } from '../mappers/batch.mapper.js';
import { toPublicUnit } from '../mappers/unit.mapper.js';

@PublicApiController('api/v1/batches')
export class PublicBatchesController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Scopes('read:batches')
  async list(@Req() req: Request, @Query() query: ListBatchesQueryDto) {
    const tenantId = req.apiKey!.tenantId;
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = parseLimit(query.limit);

    const where: Prisma.BatchWhereInput = {
      tenantId,
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.batch.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = paginate(rows, limit);
    return { data: page.data.map(toPublicBatch), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @Scopes('read:batches')
  async get(@Req() req: Request, @Param('id') id: string) {
    const tenantId = req.apiKey!.tenantId;
    const batch = await this.prisma.batch.findFirst({
      where: { id, tenantId },
    });
    if (!batch) throw new NotFoundException();
    return toPublicBatch(batch);
  }

  @Get(':id/units')
  @Scopes('read:units')
  async units(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: ListBatchUnitsQueryDto,
  ) {
    const tenantId = req.apiKey!.tenantId;
    const batch = await this.prisma.batch.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!batch) throw new NotFoundException();

    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = parseLimit(query.limit);
    const where: Prisma.UnitWhereInput = {
      tenantId,
      batchId: id,
      ...(query.state ? { state: query.state } : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.unit.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = paginate(rows, limit);
    return { data: page.data.map(toPublicUnit), nextCursor: page.nextCursor };
  }
}
