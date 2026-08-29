import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { SupportTenantsController } from './support.controller';
import { TenantLifecycleService } from './tenant-lifecycle.service';
import { TenantS3Service } from './s3.service';

@Module({
  controllers: [TenantsController, SupportTenantsController],
  providers: [
    TenantLifecycleService,
    TenantS3Service,
    { provide: 'S3', useExisting: TenantS3Service },
  ],
  exports: [TenantLifecycleService, TenantS3Service, 'S3'],
})
export class TenantsModule {}
