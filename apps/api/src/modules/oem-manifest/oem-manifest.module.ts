import { Module, OnModuleInit } from '@nestjs/common';
import { BatchesModule } from '../batches/batches.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotaService } from '../quota/quota.service';
import { BatchLifecycleService } from './batch-lifecycle.service';
import { DeliveryService } from './delivery.service';
import { ReceiptService } from './receipt.service';
import { ShipmentService } from './shipment.service';
import { OemUserService } from './oem-user.service';
import { OemScopeGuard } from './guards/oem-scope.guard';
import {
  DeliveriesController,
  DeliveryActionsController,
} from './deliveries.controller';
import { OemUsersController } from './oem-users.controller';
import { OemPortalController } from './oem-portal.controller';

@Module({
  imports: [BatchesModule, NotificationsModule],
  controllers: [
    DeliveriesController,
    DeliveryActionsController,
    OemUsersController,
    OemPortalController,
  ],
  providers: [
    BatchLifecycleService,
    DeliveryService,
    ReceiptService,
    ShipmentService,
    OemUserService,
    OemScopeGuard,
  ],
  exports: [
    BatchLifecycleService,
    DeliveryService,
    ReceiptService,
    ShipmentService,
  ],
})
export class OemManifestModule implements OnModuleInit {
  constructor(private quotaService: QuotaService) {}

  // Registered here (not only in main.ts) so it's present under Test.createTestingModule
  // too, which never runs main.ts's bootstrap().
  onModuleInit() {
    this.quotaService.registerKind('manifest_downloads_per_hour', {
      defaultLimit: 20,
      window: 'hour',
    });
  }
}
