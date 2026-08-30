import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullMQModule } from '../../jobs/bullmq.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CAPTCHA_PORT } from './captcha/captcha-port';
import { TurnstileCaptcha } from './captcha/turnstile-captcha.provider';
import { FakeCaptcha } from './captcha/fake-captcha.provider';
import { CONSENT_PORT } from './consent/consent-port';
import { InMemoryConsent } from './consent/in-memory-consent.provider';
import { ReportsS3Service } from './reports-s3.service';
import { PhotosService } from './photos.service';
import { PhotoProcessor } from './photo.processor';
import { PhotoSweepProcessor } from './photo-sweep.processor';
import { ReportsService } from './reports.service';
import { ReportsQueryService } from './reports-query.service';
import { ReportsRetentionService } from './reports-retention.service';
import { ReportsPublicController } from './reports-public.controller';
import { ReportsAdminController } from './reports-admin.controller';

@Module({
  imports: [ConfigModule, BullMQModule, NotificationsModule],
  providers: [
    TurnstileCaptcha,
    FakeCaptcha,
    {
      provide: CAPTCHA_PORT,
      useFactory: (
        config: ConfigService,
        turnstile: TurnstileCaptcha,
        fake: FakeCaptcha,
      ) =>
        config.get<string>('CAPTCHA_PROVIDER') === 'turnstile'
          ? turnstile
          : fake,
      inject: [ConfigService, TurnstileCaptcha, FakeCaptcha],
    },
    ReportsS3Service,
    PhotosService,
    PhotoProcessor,
    PhotoSweepProcessor,
    InMemoryConsent,
    {
      provide: CONSENT_PORT,
      useExisting: InMemoryConsent,
    },
    ReportsService,
    ReportsQueryService,
    ReportsRetentionService,
  ],
  controllers: [ReportsPublicController, ReportsAdminController],
  exports: [
    CAPTCHA_PORT,
    ReportsS3Service,
    PhotosService,
    ReportsQueryService,
    ReportsRetentionService,
  ],
})
export class ReportsModule {}
