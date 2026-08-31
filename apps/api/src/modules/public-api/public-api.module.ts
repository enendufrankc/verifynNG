import { Module, OnModuleInit } from '@nestjs/common';
import { loadEnv } from '@verifynng/config';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { QuotaService } from '../quota/quota.service.js';
import { ScopesGuard } from './guards/scopes.guard.js';
import { ApiErrorFilter } from './filters/api-error.filter.js';
import { ApiVersionInterceptor } from './interceptors/api-version.interceptor.js';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor.js';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor.js';
import { MeController } from './controllers/me.controller.js';
import { PublicBatchesController } from './controllers/batches.controller.js';
import { PublicUnitsController } from './controllers/units.controller.js';
import { PublicScansController } from './controllers/scans.controller.js';
import { PublicReportsController } from './controllers/reports.controller.js';
import { PUBLIC_API_QUOTA_KIND } from './constants.js';

@Module({
  imports: [ApiKeysModule, EntitlementsModule],
  controllers: [
    MeController,
    PublicBatchesController,
    PublicUnitsController,
    PublicScansController,
    PublicReportsController,
  ],
  providers: [
    ScopesGuard,
    ApiErrorFilter,
    ApiVersionInterceptor,
    RateLimitInterceptor,
    IdempotencyInterceptor,
  ],
})
export class PublicApiModule implements OnModuleInit {
  constructor(private readonly quotaService: QuotaService) {}

  // Registered here (not only in main.ts) so it's present under
  // Test.createTestingModule too, which never runs main.ts's bootstrap()
  // — same reasoning as OemManifestModule.onModuleInit().
  onModuleInit() {
    this.quotaService.registerKind(PUBLIC_API_QUOTA_KIND, {
      defaultLimit: loadEnv().PUBLIC_API_DEFAULT_RPM,
      window: 'minute',
    });
  }
}
