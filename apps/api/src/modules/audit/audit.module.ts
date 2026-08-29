/**
 * AuditModule — global module providing AuditService and @Audited() interceptor.
 */

import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useValue: new PrismaClient(),
    },
    AuditService,
    AuditChainService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, AuditChainService, PrismaClient],
})
export class AuditModule {}
