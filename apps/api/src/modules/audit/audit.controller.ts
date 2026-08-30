/**
 * Audit HTTP controllers — query, chain verification, dev demo.
 */

import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { PlatformRole, Roles, TenantId } from '../../common/tenant';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

@Controller('v1/audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async query(
    @TenantId() tenantId: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.query({
      tenantId,
      actorId,
      action,
      targetType,
      targetId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

@Controller('v1/audit/chain')
@Roles('owner')
export class AuditChainController {
  constructor(private readonly chainService: AuditChainService) {}

  @Get()
  async getLatestCheckpoint() {
    return this.chainService.getLatestCheckpoint();
  }

  @Post('verify')
  async verifyChain(@Req() req?: AuthenticatedRequest) {
    const result = await this.chainService.verifyChain({
      triggeredById: req?.user?.userId ?? req?.user?.id,
    });
    return result;
  }
}

@Controller('v1/support/audit')
@PlatformRole('support')
export class SupportAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async query(
    @Query('tenantId') tenantId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.query({
      tenantId,
      actorId,
      action,
      targetType,
      targetId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
