import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullMQModule } from '../../jobs/bullmq.module';
import { CAPTCHA_PORT } from './captcha/captcha-port';
import { TurnstileCaptcha } from './captcha/turnstile-captcha.provider';
import { FakeCaptcha } from './captcha/fake-captcha.provider';
import { ReportsS3Service } from './reports-s3.service';
import { PhotosService } from './photos.service';
import { PhotoProcessor } from './photo.processor';
import { PhotoSweepProcessor } from './photo-sweep.processor';

@Module({
  imports: [ConfigModule, BullMQModule],
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
  ],
  controllers: [],
  exports: [CAPTCHA_PORT, ReportsS3Service, PhotosService],
})
export class ReportsModule {}
