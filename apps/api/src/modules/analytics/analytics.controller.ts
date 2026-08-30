import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PlatformRole, Roles, TenantId } from '../../common/tenant';
import { Audited } from '../audit/audited.decorator.js';
import { AnalyticsReadService } from './read/analytics-read.service';
import { ScanRollupJobService } from './jobs/scan-rollup.service';
import { isRangeKey, addDaysUtc, type RangeKey } from './range.util';
import { startOfUtcDay } from './rollup/aggregate-scan-events';
import { toCsv } from './csv.util';
import { RebuildRollupsDto } from './dto/rebuild-rollups.dto';

function parseRange(range: string | undefined): RangeKey {
  return isRangeKey(range) ? range : '30d';
}

@Controller('v1/analytics')
export class AnalyticsController {
  // Explicit @Inject(AnalyticsReadService) — see RollupCountersSubscriber's
  // constructor comment (tsx/esbuild decorator metadata gap; jobs:run only).
  constructor(
    @Inject(AnalyticsReadService)
    private readonly analyticsRead: AnalyticsReadService,
  ) {}

  @Get('overview')
  @Roles('viewer')
  overview(@TenantId() tenantId: string, @Query('range') range?: string) {
    return this.analyticsRead.overview(tenantId, parseRange(range));
  }

  @Get('batches')
  @Roles('viewer')
  batches(
    @TenantId() tenantId: string,
    @Query('range') range?: string,
    @Query('sort') sort?: string,
  ) {
    return this.analyticsRead.byBatch(tenantId, parseRange(range), sort);
  }

  @Get('products')
  @Roles('viewer')
  products(
    @TenantId() tenantId: string,
    @Query('range') range?: string,
    @Query('sort') sort?: string,
  ) {
    return this.analyticsRead.byProduct(tenantId, parseRange(range), sort);
  }

  @Get('geo')
  @Roles('viewer')
  geo(
    @TenantId() tenantId: string,
    @Query('range') range?: string,
    @Query('groupBy') groupBy?: string,
    @Query('batchId') batchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.analyticsRead.geo(
      tenantId,
      parseRange(range),
      groupBy === 'city' ? 'city' : 'country',
      {
        batchId,
        productId,
      },
    );
  }

  @Get('verdicts')
  @Roles('viewer')
  verdicts(
    @TenantId() tenantId: string,
    @Query('range') range?: string,
    @Query('batchId') batchId?: string,
    @Query('productId') productId?: string,
  ) {
    return this.analyticsRead.verdictSeries(tenantId, parseRange(range), {
      batchId,
      productId,
    });
  }

  @Get('export.csv')
  @Roles('operator')
  @Audited('analytics.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @TenantId() tenantId: string,
    @Query('range') range: string | undefined,
    @Query('dimension') dimension: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const r = parseRange(range);
    const dim =
      dimension === 'product' || dimension === 'geo' || dimension === 'verdict'
        ? dimension
        : 'batch';

    let csv: string;
    switch (dim) {
      case 'product': {
        const rows = await this.analyticsRead.byProduct(tenantId, r);
        csv = toCsv(rows, [
          'productId',
          'scans',
          'tier2Verifies',
          'suspicious',
          'flagged',
          'topCountry',
        ]);
        break;
      }
      case 'geo': {
        const rows = await this.analyticsRead.geo(tenantId, r);
        csv = toCsv(rows, [
          'country',
          'city',
          'scans',
          'tier2Verifies',
          'suspicious',
        ]);
        break;
      }
      case 'verdict': {
        const rows = await this.analyticsRead.verdictSeries(tenantId, r);
        csv = toCsv(rows, ['date', 'verdict', 'count']);
        break;
      }
      default: {
        const rows = await this.analyticsRead.byBatch(tenantId, r);
        csv = toCsv(rows, [
          'batchId',
          'productId',
          'scans',
          'tier2Verifies',
          'suspicious',
          'flagged',
          'topCountry',
        ]);
      }
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="analytics-${dim}-${r}.csv"`,
    );
    return csv;
  }
}

@Controller('v1/analytics/rollups')
@PlatformRole('support')
export class AnalyticsRollupsController {
  // Explicit @Inject(ScanRollupJobService) — see RollupCountersSubscriber's
  // constructor comment (tsx/esbuild decorator metadata gap; jobs:run only).
  constructor(
    @Inject(ScanRollupJobService)
    private readonly scanRollup: ScanRollupJobService,
  ) {}

  @Post('rebuild')
  async rebuild(@Body() dto: RebuildRollupsDto) {
    const from = dto.from
      ? startOfUtcDay(new Date(dto.from))
      : startOfUtcDay(new Date());
    const to = dto.to ? startOfUtcDay(new Date(dto.to)) : from;

    let rowsWritten = 0;
    let cursorDate = from;
    let daysProcessed = 0;
    while (cursorDate.getTime() <= to.getTime()) {
      rowsWritten += await this.scanRollup.recomputeDay(
        dto.tenantId,
        cursorDate,
      );
      cursorDate = addDaysUtc(cursorDate, 1);
      daysProcessed += 1;
    }

    return { rowsWritten, daysProcessed };
  }
}
