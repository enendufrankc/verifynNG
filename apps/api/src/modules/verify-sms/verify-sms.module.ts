import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { DatabaseModule } from '../database/database.module';
import { ScanEventsModule } from '../scan-events/scan-events.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { GeoIpModule } from '../geoip/geoip.module';

import { VerifySmsController } from './verify-sms.controller';
import { VerdictEngine } from '../verify/verdict-engine';
import { SMS_PORT, SmsPort } from './sms.port';
import { HttpFakeSms } from './http-fake-sms';

/**
 * VerifySmsModule — inbound SMS verification webhook.
 *
 * `POST /v1/verify/sms` parses a code out of an inbound SMS text, runs the
 * same VerdictEngine as the public controller, records a `ScanEvent`
 * (`source='sms'`), and replies to the sender via the {@link SmsPort}.
 */
@Module({
  imports: [
    DatabaseModule,
    ScanEventsModule,
    RateLimitModule,
    GeoIpModule,
    EventEmitterModule,
  ],
  controllers: [VerifySmsController],
  providers: [
    VerdictEngine,
    {
      provide: SMS_PORT,
      useFactory: (configService: ConfigService): SmsPort => {
        const provider = configService.get<string>('SMS_PROVIDER')!;
        switch (provider) {
          case 'fake':
          default:
            return new HttpFakeSms(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class VerifySmsModule {}
