import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PlatformRole, Principal, Roles, TenantId } from '../../common/tenant';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import type { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { IncidentService } from './incident.service';

@Controller('v1/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentService) {}

  @PlatformRole('support')
  @Post()
  @Audited('incident.opened')
  open(
    @Principal() principal: UserPrincipal,
    @Body()
    body: {
      title: string;
      severity: IncidentSeverity;
      detectedAt: string;
      occurredAt?: string;
      dataCategories: string[];
      affectedTenantIds: string[];
      estimatedSubjects?: number;
    },
  ) {
    return this.incidents.open({
      title: body.title,
      severity: body.severity,
      detectedAt: new Date(body.detectedAt),
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      dataCategories: body.dataCategories,
      affectedTenantIds: body.affectedTenantIds,
      estimatedSubjects: body.estimatedSubjects,
      openedById: principal.userId,
    });
  }

  @PlatformRole('support')
  @Get()
  listAll() {
    return this.incidents.listAll();
  }

  @Roles('owner', 'operator', 'viewer')
  @Get('mine')
  listMine(@TenantId() tenantId: string) {
    return this.incidents.listForTenant(tenantId);
  }

  @PlatformRole('support')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.incidents.get(id);
  }

  @PlatformRole('support')
  @Patch(':id')
  @Audited('incident.updated')
  update(
    @Param('id') id: string,
    @Principal() principal: UserPrincipal,
    @Body()
    body: { status?: IncidentStatus; note?: string; postmortemUrl?: string },
  ) {
    return this.incidents.update(id, { ...body, actorId: principal.userId });
  }
}
