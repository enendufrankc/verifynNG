import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AnomalyStatus, PrismaClient } from '@prisma/client';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Principal } from '../auth/decorators/principal.decorator';
import { isApiClientPrincipal } from '../auth/types/principal';
import type { Principal as PrincipalType } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator.js';
import { AnomalyQueryService } from './anomaly-query.service';
import { AnomalyNoteDto, AssignAnomalyDto } from './dto/anomaly-note.dto';

function userIdOf(principal: PrincipalType | undefined): string | undefined {
  return principal && !isApiClientPrincipal(principal)
    ? principal.userId
    : undefined;
}

@Controller('v1/anomalies')
export class AnomaliesController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly anomalyQuery: AnomalyQueryService,
  ) {}

  @Get('summary')
  @Roles('viewer')
  summary(@TenantId() tenantId: string) {
    return this.anomalyQuery.summary(tenantId);
  }

  @Get()
  @Roles('viewer')
  async list(
    @TenantId() tenantId: string,
    @Query('status') status?: AnomalyStatus,
    @Query('rule') rule?: string,
    @Query('batchId') batchId?: string,
    @Query('unitId') unitId?: string,
    @Query('minScore') minScore?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(limit ? parseInt(limit, 10) : 50, 200);
    const items = await this.prisma.anomaly.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(rule ? { rule } : {}),
        ...(batchId ? { batchId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(minScore ? { score: { gte: parseInt(minScore, 10) } } : {}),
      },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    let nextCursor: string | undefined;
    if (items.length > take) nextCursor = items.pop()!.id;
    return { items, cursor: nextCursor };
  }

  @Get(':id')
  @Roles('viewer')
  async get(@TenantId() tenantId: string, @Param('id') id: string) {
    const anomaly = await this.prisma.anomaly.findFirst({
      where: { id, tenantId },
    });
    if (!anomaly) throw new NotFoundException();

    const [unit, batch] = await Promise.all([
      anomaly.unitId
        ? this.prisma.unit.findUnique({ where: { id: anomaly.unitId } })
        : null,
      anomaly.batchId
        ? this.prisma.batch.findUnique({ where: { id: anomaly.batchId } })
        : null,
    ]);

    return { anomaly, unit, batch };
  }

  @Post(':id/acknowledge')
  @Roles('operator')
  @Audited('anomaly.acknowledge')
  acknowledge(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AnomalyNoteDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.setStatus(
      tenantId,
      id,
      'acknowledged',
      dto.note,
      userIdOf(principal),
    );
  }

  @Post(':id/resolve')
  @Roles('operator')
  @Audited('anomaly.resolve')
  resolve(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AnomalyNoteDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.setStatus(
      tenantId,
      id,
      'resolved',
      dto.note,
      userIdOf(principal),
    );
  }

  @Post(':id/dismiss')
  @Roles('operator')
  @Audited('anomaly.dismiss')
  dismiss(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AnomalyNoteDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.setStatus(
      tenantId,
      id,
      'dismissed',
      dto.note,
      userIdOf(principal),
    );
  }

  @Post(':id/assign')
  @Roles('operator')
  @Audited('anomaly.assign')
  async assign(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignAnomalyDto,
  ) {
    const anomaly = await this.prisma.anomaly.findFirst({
      where: { id, tenantId },
    });
    if (!anomaly) throw new NotFoundException();

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: dto.userId, tenantId } },
    });
    if (!membership)
      throw new BadRequestException('assignee is not a member of this tenant');

    return this.prisma.anomaly.update({
      where: { id },
      data: { assignedToId: dto.userId },
    });
  }

  private async setStatus(
    tenantId: string,
    id: string,
    status: AnomalyStatus,
    note: string | undefined,
    actorId: string | undefined,
  ) {
    const anomaly = await this.prisma.anomaly.findFirst({
      where: { id, tenantId },
    });
    if (!anomaly) throw new NotFoundException();
    if (anomaly.status !== 'open' && anomaly.status !== 'acknowledged') {
      throw new ConflictException(`anomaly already ${anomaly.status}`);
    }

    const isTerminal = status === 'resolved' || status === 'dismissed';
    return this.prisma.anomaly.update({
      where: { id },
      data: {
        status,
        note: note ?? anomaly.note,
        ...(isTerminal
          ? { resolvedAt: new Date(), resolvedById: actorId ?? null }
          : {}),
      },
    });
  }
}
