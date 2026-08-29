import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { SupportTenantsController } from './support.controller';
import { TenantLifecycleService } from './tenant-lifecycle.service';

@Module({
  controllers: [TenantsController, SupportTenantsController],
  providers: [TenantLifecycleService],
  exports: [TenantLifecycleService],
})
export class TenantsModule {}
