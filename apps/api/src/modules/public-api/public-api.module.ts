import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ScopesGuard } from './guards/scopes.guard.js';
import { ApiErrorFilter } from './filters/api-error.filter.js';
import { ApiVersionInterceptor } from './interceptors/api-version.interceptor.js';
import { MeController } from './controllers/me.controller.js';

@Module({
  imports: [ApiKeysModule, EntitlementsModule],
  controllers: [MeController],
  providers: [ScopesGuard, ApiErrorFilter, ApiVersionInterceptor],
})
export class PublicApiModule {}
