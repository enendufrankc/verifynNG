import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeysController } from './api-keys.controller.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [ApiKeysController],
  providers: [ApiKeyService, ApiKeyGuard],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class ApiKeysModule {}
