/**
 * Audit HTTP controllers — query, chain verification, dev demo.
 */

import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

@Controller('v1/audit')
export class AuditController {
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
    @Req() req?: AuthenticatedRequest,
  ) {
    // E13 stub: tenantId from @TenantId() when E02 ships. No forced default —
    // pre-auth there is no tenant context, so an unscoped query returns everything.
    const resolvedTenantId = tenantId ?? req?.user?.tenantId;

    return this.auditService.query({
      tenantId: resolvedTenantId,
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
export class AuditChainController {
  constructor(private readonly chainService: AuditChainService) {}

  @Get()
  async getLatestCheckpoint() {
    return this.chainService.getLatestCheckpoint();
  }

  @Post('verify')
  async verifyChain(@Req() req?: AuthenticatedRequest) {
    const result = await this.chainService.verifyChain({
      triggeredById: req?.user?.id,
    });
    return result;
  }
}

@Controller('v1/support/audit')
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
    // Support role can query across tenants — E02 will guard this
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
