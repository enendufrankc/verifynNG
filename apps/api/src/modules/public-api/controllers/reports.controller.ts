import { Get, NotFoundException, Param, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaClient, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ApiPublicCommonResponses } from '../decorators/api-common-responses.decorator.js';
import { ListReportsQueryDto } from '../dto/list-reports-query.dto.js';
import {
  ReportResponseDto,
  ReportsPageDto,
} from '../dto/responses/report.response.dto.js';
import { ErrorResponseDto } from '../dto/responses/error.response.dto.js';
import { decodeCursor, paginate, parseLimit } from '../pagination.js';
import { toPublicReport } from '../mappers/report.mapper.js';

@ApiTags('reports')
@ApiBearerAuth('apiKey')
@ApiPublicCommonResponses()
@PublicApiController('api/v1/reports')
export class PublicReportsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  @Scopes('read:reports')
  @ApiOperation({
    summary: 'List consumer fake-reports for the authenticated tenant',
  })
  @ApiResponse({ status: 200, type: ReportsPageDto })
  async list(@Req() req: Request, @Query() query: ListReportsQueryDto) {
    const tenantId = req.apiKey!.tenantId;
    const decoded = query.cursor ? decodeCursor(query.cursor) : null;
    const limit = parseLimit(query.limit);

    const where: Prisma.ReportWhereInput = {
      tenantId,
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

    const rows = await this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = paginate(rows, limit);
    return {
      data: page.data.map(toPublicReport),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':id')
  @Scopes('read:reports')
  @ApiOperation({ summary: 'Get a single report' })
  @ApiResponse({ status: 200, type: ReportResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Not found, or belongs to another tenant — never 403.',
    type: ErrorResponseDto,
  })
  async get(@Req() req: Request, @Param('id') id: string) {
    const tenantId = req.apiKey!.tenantId;
    const report = await this.prisma.report.findFirst({
      where: { id, tenantId },
    });
    if (!report) throw new NotFoundException();
    return toPublicReport(report);
  }
}
