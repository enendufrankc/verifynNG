import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlatformRole } from '../../../common/tenant';
import { TenantDirectoryService } from './tenant-directory.service';

@Controller('v1/platform/tenants')
@PlatformRole('support')
export class TenantDirectoryController {
  constructor(private readonly directory: TenantDirectoryService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.directory.list({ q, status, cursor });
  }

  @Get(':tenantId')
  get(@Param('tenantId') tenantId: string) {
    return this.directory.get(tenantId);
  }
}
