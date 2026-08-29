import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { SupportTenantsController } from './support.controller';
import { TenantLifecycleService } from './tenant-lifecycle.service';
import { TenantS3Service } from './s3.service';
import { TenantEventBus } from './tenant-events';
import { TenantOffboardingProcessor } from '../../jobs/tenant-offboarding.processor';

@Module({
  controllers: [TenantsController, SupportTenantsController],
  providers: [
    TenantLifecycleService,
    TenantS3Service,
    TenantEventBus,
    TenantOffboardingProcessor,
    { provide: 'S3', useExisting: TenantS3Service },
  ],
  exports: [
    TenantLifecycleService,
    TenantS3Service,
    TenantEventBus,
    TenantOffboardingProcessor,
    'S3',
  ],
})
export class TenantsModule {}
