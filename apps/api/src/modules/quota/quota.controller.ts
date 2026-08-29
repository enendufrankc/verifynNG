/**
 * Quota HTTP controllers.
 */

import { Controller, Get, Put, Body, Query, Req } from '@nestjs/common';
import { QuotaService } from './quota.service.js';

@Controller('v1/quotas')
export class QuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Get()
  async getAll(@Req() req: any) {
    const tenantId = req?.user?.tenantId ?? 'ivoryglow';
    return this.quotaService.getAllKinds(tenantId);
  }
}

@Controller('v1/support/quotas')
export class SupportQuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Put(':tenantId')
  async upsert(
    @Query('tenantId') tenantIdFromParam: string,
    @Body() body: { kind: string; limit: number; window: string; note?: string },
  ) {
    await this.quotaService.upsertOverride(
      tenantIdFromParam,
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
export class DevQuotaController {
  constructor(private readonly quotaService: QuotaService) {}

  @Put('register')
  async register(@Body() body: { kind: string; limit: number; window: string }) {
    this.quotaService.registerKind(body.kind, {
      defaultLimit: body.limit,
      window: body.window as 'minute' | 'hour' | 'day',
    });
    return { ok: true, kind: body.kind, limit: body.limit, window: body.window };
  }

  @Post()
  async check(@Req() req: any) {
    // Use x-tenant header or default to ivoryglow
    const tenantId = req.headers['x-tenant'] ?? 'ivoryglow';
    await this.quotaService.assertWithinQuota(tenantId, 'demo_per_min');
    return { ok: true };
  }
}
