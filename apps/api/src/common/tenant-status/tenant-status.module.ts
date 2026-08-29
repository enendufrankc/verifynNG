import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrincipalGuard } from '../principal';
import { TenantStatusGuard } from './tenant-status.guard';

@Global()
@Module({
  providers: [
    PrincipalGuard,
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
  ],
})
export class TenantStatusModule {}
