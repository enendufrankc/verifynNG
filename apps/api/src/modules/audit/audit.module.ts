/**
 * AuditModule — global module providing AuditService and @Audited() interceptor.
 */

import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import {
  AuditController,
  AuditChainController,
  SupportAuditController,
} from './audit.controller.js';
import { DevAuditController } from './dev-audit.controller.js';
import { APP_INTERCEPTOR } from '@nestjs/core';

const devControllers =
  process.env.NODE_ENV === 'production' ? [] : [DevAuditController];

@Global()
@Module({
  controllers: [
    AuditController,
    AuditChainController,
    SupportAuditController,
    ...devControllers,
  ],
  providers: [
    AuditService,
    AuditChainService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, AuditChainService],
})
export class AuditModule {}
