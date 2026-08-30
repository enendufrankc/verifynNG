import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaClient } from '@prisma/client';

import { MAILER } from './ports/mailer.port';
import { SMS } from './ports/sms.port';
import { WHATSAPP } from './ports/whatsapp.port';

import { SmtpMailer } from './adapters/smtp-mailer.adapter';
import { ResendMailer } from './adapters/resend-mailer.adapter';
import { FakeSms } from './adapters/fake-sms.adapter';
import { TermiiSms } from './adapters/termii-sms.adapter';
import { FakeWhatsApp } from './adapters/fake-whatsapp.adapter';
import { MetaWhatsApp } from './adapters/meta-whatsapp.adapter';

import {
  NotificationsController,
  WebhooksController,
  DevController,
} from './notifications.controller';
import { NotificationService } from './notifications.service';
import { NotificationWorker } from './notifications.worker';
import { OutboxService } from './outbox/outbox.service';
import { SuppressionsService } from './suppressions/suppressions.service';
import { TemplateRegistry } from './templates/registry';
import { BrandingResolver } from './routing/branding-resolver';
import { EventRouter } from './routing/event-router';
import { WebhooksService } from './webhooks/webhooks.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.get<string>('REDIS_URL')!);
        return {
          connection: {
            host: redisUrl.hostname,
            port: Number(redisUrl.port || 6379),
            maxRetriesPerRequest: null,
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'notifications' }),
    // Not EventEmitterModule.forRoot() here — see the note in app.module.ts;
    // it's called exactly once app-wide, in common/events.module.ts. This
    // module's own EventRouter injects EventEmitter2 directly and was
    // silently never receiving events while this called forRoot() again.
  ],
  controllers: [NotificationsController, WebhooksController, DevController],
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
    {
      provide: MAILER,
      useFactory: (config: ConfigService) => {
        switch (config.get('MAIL_PROVIDER')) {
          case 'resend':
            return new ResendMailer(config);
          default:
            return new SmtpMailer(config);
        }
      },
      inject: [ConfigService],
    },
    {
      provide: SMS,
      useFactory: (config: ConfigService) => {
        switch (config.get('SMS_PROVIDER')) {
          case 'termii':
            return new TermiiSms(config);
          default:
            return new FakeSms(config);
        }
      },
      inject: [ConfigService],
    },
    {
      provide: WHATSAPP,
      useFactory: (config: ConfigService) => {
        switch (config.get('WHATSAPP_PROVIDER')) {
          case 'meta':
            return new MetaWhatsApp();
          default:
            return new FakeWhatsApp(config);
        }
      },
      inject: [ConfigService],
    },
    OutboxService,
    SuppressionsService,
    TemplateRegistry,
    BrandingResolver,
    EventRouter,
    WebhooksService,
    NotificationService,
    NotificationWorker,
  ],
  exports: [MAILER, SMS, WHATSAPP, NotificationService],
})
export class NotificationsModule {}
