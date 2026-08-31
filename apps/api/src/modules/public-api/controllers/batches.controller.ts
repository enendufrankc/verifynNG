import {
  Body,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import {
  PublicApiController,
  Idempotent,
} from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ListBatchesQueryDto } from '../dto/list-batches-query.dto.js';
import { ListBatchUnitsQueryDto } from '../dto/list-batch-units-query.dto.js';
import { CreatePublicBatchDto } from '../dto/create-public-batch.dto.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import { toPublicBatch } from '../mappers/batch.mapper.js';
import { toPublicUnit } from '../mappers/unit.mapper.js';
import { MintService } from '../../batches/mint.service.js';
import { AuditService } from '../../audit/audit.service.js';

@PublicApiController('api/v1/batches')
export class PublicBatchesController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mintService: MintService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @HttpCode(202)
  @Scopes('write:batches')
  @Idempotent()
  async create(
    @Req() req: Request,
    @Body() dto: CreatePublicBatchDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const apiKey = req.apiKey!;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    const result = await this.mintService.mint({
      tenantId: apiKey.tenantId,
      productId: dto.productId,
      oemId: dto.oemId,
      count: dto.count,
      idempotencyKey,
      requestedBy: `apikey:${apiKey.keyId}`,
      note: dto.note,
    });

    if (!result.existing) {
      await this.auditService.record({
        tenantId: apiKey.tenantId,
        actor: { type: 'apikey', id: apiKey.keyId },
        action: 'batch.create',
        target: { type: 'batch', id: result.batch.id },
        payload: {
          productId: dto.productId,
          oemId: dto.oemId,
          count: dto.count,
        },
      });
    }

    res.setHeader('Location', `/api/v1/batches/${result.batch.id}`);
    // No public download route exists yet for exports — see docs/epics/E16-public-api-webhooks.md
    // notes; avoids ExportsService.getSignedUrl()'s side effect of emitting
    // `manifest.downloaded` for a link nobody has followed yet.
    return { batch: toPublicBatch(result.batch), exportUrl: null };
  }

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
