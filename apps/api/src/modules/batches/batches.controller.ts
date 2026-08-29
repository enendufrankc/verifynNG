import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BatchesService } from './batches.service';
import { MintService } from './mint.service';
import { ExportsService } from './exports.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { TenantId } from '../../common/tenant-id.decorator';

type ArtefactKind = 'qr-zip' | 'sheet-pdf' | 'tier1-csv' | 'all-zip';

@Controller('tenants/:tenantId/batches')
export class BatchesController {
  constructor(
    private batchesService: BatchesService,
    private mintService: MintService,
    private exportsService: ExportsService,
  ) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.batchesService.list(tenantId, { status, productId, cursor });
  }

  @Post()
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateBatchDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mintService.mint({
      tenantId,
      productId: dto.productId,
      oemId: dto.oemId,
      count: dto.count,
      idempotencyKey: dto.idempotencyKey,
      requestedBy: 'placeholder',
      note: dto.note,
    });
    if (result.existing) res.status(200);
    if (result.mode === 'job') {
      return { batch: result.batch, jobId: result.jobId };
    }
    return result.batch;
  }

  @Get(':batchId')
  get(@TenantId() tenantId: string, @Param('batchId') batchId: string) {
    return this.batchesService.get(tenantId, batchId);
  }

  @Get(':batchId/units')
  getUnits(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.batchesService.getUnitsPage(
      tenantId,
      batchId,
      cursor,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get(':batchId/downloads/:artefact')
  async download(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Param('artefact') artefact: string,
    @Res() res: Response,
  ) {
    const { url } = await this.exportsService.getSignedUrl(
      tenantId,
      batchId,
      artefact as ArtefactKind,
    );
    return res.redirect(302, url);
  }
}
