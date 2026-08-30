import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { SupportTenantsController } from './support.controller';
import { TenantLifecycleService } from './tenant-lifecycle.service';
import { TenantS3Service } from './s3.service';
import { TenantEventBus } from './tenant-events';
import { TenantOffboardingProcessor } from '../../jobs/tenant-offboarding.processor';
import { TenantOffboardingQueue } from '../../jobs/tenant-offboarding.queue';
import { RETENTION_POLICY, defaultRetentionPolicy } from './retention-policy';

@Module({
  controllers: [TenantsController, SupportTenantsController],
  providers: [
    TenantLifecycleService,
    TenantS3Service,
    TenantEventBus,
    TenantOffboardingProcessor,
    TenantOffboardingQueue,
    { provide: 'S3', useExisting: TenantS3Service },
    { provide: RETENTION_POLICY, useValue: defaultRetentionPolicy },
  ],
  exports: [
    TenantLifecycleService,
    TenantS3Service,
    TenantEventBus,
    TenantOffboardingProcessor,
    'S3',
    RETENTION_POLICY,
  ],
})
export class TenantsModule {}
