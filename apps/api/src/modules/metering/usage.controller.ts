import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PlatformRole, Roles, TenantId } from '../../common/tenant';
import { UsageReadService } from './usage-read.service';
import { currentMonthUtc } from './month.util';

@Controller('v1/tenants/:tenantId/usage')
export class UsageController {
  // Explicit @Inject(UsageReadService) — see RollupCountersSubscriber's
  // constructor comment (tsx/esbuild decorator metadata gap; jobs:run only).
  constructor(
    @Inject(UsageReadService) private readonly usageRead: UsageReadService,
  ) {}

  // owner for own tenant; a `support` platformRole principal may pass any
  // :tenantId — TenantContextGuard/RolesGuard already enforce that split.
  @Get()
  @Roles('owner')
  summary(@TenantId() tenantId: string, @Query('month') month?: string) {
    return this.usageRead.summary(tenantId, month ?? currentMonthUtc());
  }

  @Get('events')
  @PlatformRole('support')
  events(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.usageRead.raw(tenantId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
    });
  }
}
