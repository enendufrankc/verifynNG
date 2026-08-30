import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles, TenantId } from '../../common/tenant';
import { Audited } from '../audit/audited.decorator';
import { ReportsService } from './reports.service';
import { ReportAssignDto } from './dto/report-assign.dto';
import { ReportNoteDto } from './dto/report-note.dto';
import { ReportStatusChangeDto } from './dto/report-status.dto';
import type { AuthenticatedRequest } from '../../common/authenticated-request';

@Controller('v1/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Roles('viewer')
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('outcome') outcome?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('batchId') batchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reports.list(tenantId, {
      status,
      outcome,
      assignedToId,
      batchId,
      from,
      to,
      q,
      cursor,
    });
  }

  @Get('summary')
  @Roles('viewer')
  summary(@TenantId() tenantId: string) {
    return this.reports.summary(tenantId);
  }

  @Get(':id')
  @Roles('viewer')
  async detail(@TenantId() tenantId: string, @Param('id') id: string) {
    const report = await this.reports.detail(tenantId, id);
    // E07 not yet shipped — anomalies stubbed to [] per CROSS-EPIC-REQUESTS.md.
    return { ...report, anomalies: [] as unknown[] };
  }

  @Post(':id/assign')
  @Roles('operator')
  @Audited('report.assign', {
    target: (req) => ({ type: 'report', id: String(req.params.id) }),
  })
  async assign(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ReportAssignDto,
  ) {
    await this.reports.assign(tenantId, id, dto.memberId);
    return { ok: true };
  }

  @Post(':id/notes')
  @Roles('operator')
  @Audited('report.note.add', {
    target: (req) => ({ type: 'report', id: String(req.params.id) }),
  })
  async addNote(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportNoteDto,
  ) {
    await this.reports.addNote(tenantId, id, req.user!.userId!, dto.body);
    return { ok: true };
  }

  @Post(':id/status')
  @Roles('operator')
  @Audited('report.status.change', {
    target: (req) => ({ type: 'report', id: String(req.params.id) }),
  })
  async changeStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReportStatusChangeDto,
  ) {
    await this.reports.changeStatus(tenantId, id, req.user!.userId!, dto);
    return { ok: true };
  }
}
