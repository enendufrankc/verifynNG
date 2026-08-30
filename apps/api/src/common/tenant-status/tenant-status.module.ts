import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrincipalAdapterGuard } from '../principal';
import { TenantStatusGuard } from './tenant-status.guard';

@Global()
@Module({
  providers: [
    PrincipalAdapterGuard,
    { provide: APP_GUARD, useClass: PrincipalAdapterGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
  ],
})
export class TenantStatusModule {}
