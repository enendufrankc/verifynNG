import { Get, Query, Req } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ListScansQueryDto } from '../dto/list-scans-query.dto.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import { toPublicScanEvent } from '../mappers/scan-event.mapper.js';

@PublicApiController('api/v1/scans')
export class PublicScansController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Scopes('read:scans')
  async list(@Req() req: Request, @Query() query: ListScansQueryDto) {
    const tenantId = req.apiKey!.tenantId;
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = parseLimit(query.limit);

    const where: Prisma.ScanEventWhereInput = {
      tenantId,
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.verdict ? { verdict: query.verdict } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.scanEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = paginate(rows, limit);
    return {
      data: page.data.map(toPublicScanEvent),
      nextCursor: page.nextCursor,
    };
  }
}
