/**
 * Quota HTTP controllers.
 */

import { Controller, Get, Post, Put, Body, Param, Req } from '@nestjs/common';
import { PlatformRole, Public, TenantId } from '../../common/tenant';
import { QuotaService } from './quota.service.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

@Controller('v1/quotas')
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  async getAll(@TenantId() tenantId: string) {
    return this.quotaService.getAllKinds(tenantId);
  }
}

@Controller('v1/support/quotas')
@PlatformRole('support')
export class SupportQuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Put(':tenantId')
  async upsert(
    @Param('tenantId') tenantId: string,
    @Body()
    body: { kind: string; limit: number; window: string; note?: string },
  ) {
    await this.quotaService.upsertOverride(
      tenantId,
      body.kind,
      body.limit,
      body.window as 'minute' | 'hour' | 'day',
      body.note,
    );
    return { ok: true };
  }
}

/**
 * Dev-only quota demo controller.
 * Used by AC5 to test assertWithinQuota.
 */
@Controller('v1/_dev/quota-demo')
@Public()
export class DevQuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Put('register')
  async register(
    @Body() body: { kind: string; limit: number; window: string },
  ) {
    this.quotaService.registerKind(body.kind, {
      defaultLimit: body.limit,
      window: body.window as 'minute' | 'hour' | 'day',
    });
    return {
      ok: true,
      kind: body.kind,
      limit: body.limit,
      window: body.window,
    };
  }

  @Post()
  async check(@Req() req: AuthenticatedRequest) {
    // Dev-only: tenant comes from the x-tenant header (no auth on this route).
    const tenantHeader = req.headers['x-tenant'];
    const tenantId = String(
      (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) ??
        'dev-tenant',
    );
    await this.quotaService.assertWithinQuota(tenantId, 'demo_per_min');
    return { ok: true };
  }
}
