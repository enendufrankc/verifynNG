import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Principal } from '../auth/decorators/principal.decorator';
import { isApiClientPrincipal } from '../auth/types/principal';
import type { Principal as PrincipalType } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { UnitLifecycleService } from './unit-lifecycle.service';
import { AnomalyQueryService } from '../anomaly/anomaly-query.service';
import { FlagUnitDto } from './dto/flag-unit.dto';

function userIdOf(principal: PrincipalType | undefined): string | undefined {
  return principal && !isApiClientPrincipal(principal)
    ? principal.userId
    : undefined;
}

// AuditInterceptor's default target resolver derives the type from the
// controller class name ("UnitsController" -> "units", plural) — audit rows
// for these routes must read `targetType=unit` (singular) to match the
// system-actor audit calls UnitLifecycleService writes itself for auto-flag.
const unitAuditTarget = (req: AuthenticatedRequest) => ({
  type: 'unit',
  id: (req.params?.id as string) ?? 'unknown',
});

@Controller('v1/units')
export class UnitsController {
  constructor(
    private readonly lifecycle: UnitLifecycleService,
    private readonly prisma: PrismaClient,
    private readonly anomalyQuery: AnomalyQueryService,
  ) {}

  @Get(':id')
  @Roles('viewer')
  async get(@TenantId() tenantId: string, @Param('id') id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, tenantId },
    });
    if (!unit) return { error: 'not_found' };

    const [transitions, scanEvents, anomalies] = await Promise.all([
      this.prisma.unitStateTransition.findMany({
        where: { unitId: id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.scanEvent.findMany({
        where: { unitId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.anomalyQuery.forUnit(id),
    ]);

    return { unit, transitions, scanEvents, anomalies };
  }

  @Post(':id/flag')
  @Roles('operator')
  @Audited('unit.flag', { target: unitAuditTarget })
  flag(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.lifecycle.flag(tenantId, id, {
      actor: { type: 'user', id: userIdOf(principal) },
      reason: dto.reason,
    });
  }

  @Post(':id/decommission')
  @Roles('owner')
  @Audited('unit.decommission', { target: unitAuditTarget })
  decommission(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.lifecycle.decommission(tenantId, id, {
      actor: { type: 'user', id: userIdOf(principal) },
      reason: dto.reason,
    });
  }

  @Post(':id/restore')
  @Roles('owner')
  @Audited('unit.restore', { target: unitAuditTarget })
  restore(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.lifecycle.restore(tenantId, id, {
      actor: { type: 'user', id: userIdOf(principal) },
      reason: dto.reason,
    });
  }
}
