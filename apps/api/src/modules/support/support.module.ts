import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { PrismaClient } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { QuotaModule } from '../quota/quota.module.js';
import { QuotaService } from '../quota/quota.service.js';
import { TenantDirectoryService } from './tenant-directory/tenant-directory.service';
import { TenantDirectoryController } from './tenant-directory/tenant-directory.controller';
import {
  ImpersonationService,
  IMPERSONATION_EXPIRE_QUEUE,
} from './impersonation/impersonation.service';
import { ImpersonationController } from './impersonation/impersonation.controller';
import { ImpersonationGuard } from './impersonation/impersonation.guard';
import { ImpersonationProcessor } from './impersonation/impersonation.processor';
import { CannedResponsesService } from './tickets/canned-responses.service';
import { TicketsService } from './tickets/tickets.service';
import {
  TicketsPlatformController,
  CannedResponsesController,
} from './tickets/tickets-platform.controller';
import { TicketsTenantController } from './tickets/tickets-tenant.controller';
import { TicketsPublicController } from './tickets/tickets-public.controller';
import { InboundMailListener } from './mail/inbound-mail.listener';
import { DevSimulateInboundController } from './mail/dev-simulate-inbound.controller';

const devControllers =
  process.env.NODE_ENV === 'production' ? [] : [DevSimulateInboundController];

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    // For CAPTCHA_PORT, consumed by the public support form (T8).
    ReportsModule,
    QuotaModule,
    BullModule.registerQueue({ name: IMPERSONATION_EXPIRE_QUEUE }),
  ],
  controllers: [
    TenantDirectoryController,
    ImpersonationController,
    TicketsPlatformController,
    CannedResponsesController,
    TicketsTenantController,
    TicketsPublicController,
    ...devControllers,
  ],
  providers: [
    { provide: PrismaClient, useFactory: () => new PrismaClient() },
    TenantDirectoryService,
    ImpersonationService,
    CannedResponsesService,
    TicketsService,
    InboundMailListener,
    ImpersonationProcessor,
    { provide: APP_GUARD, useClass: ImpersonationGuard },
  ],
})
export class SupportModule implements OnModuleInit {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly cannedResponses: CannedResponsesService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Registered here (not only in main.ts) so it's present under
    // Test.createTestingModule too — see OemManifestModule's precedent,
    // noted in CROSS-EPIC-REQUESTS.md "To E13 Audit & Security".
    this.quotaService.registerKind('support_public_form_per_ip_per_hour', {
      defaultLimit: this.config.get<number>('SUPPORT_PUBLIC_FORM_RPH', 5),
      window: 'hour',
    });
    await this.cannedResponses.seedDefaults();
  }
}
