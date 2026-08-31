import { Module } from '@nestjs/common';
import {
  ENTITLEMENT_SERVICE,
  StubEntitlementService,
} from './entitlement.service.js';

@Module({
  providers: [
    { provide: ENTITLEMENT_SERVICE, useClass: StubEntitlementService },
  ],
  exports: [ENTITLEMENT_SERVICE],
})
export class EntitlementsModule {}
