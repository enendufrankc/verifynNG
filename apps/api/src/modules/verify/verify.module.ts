import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { DatabaseModule } from '../database/database.module';
import { ScanEventsModule } from '../scan-events/scan-events.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { GeoIpModule } from '../geoip/geoip.module';

import { VerifyController } from './verify.controller';
import { VerdictEngine } from './verdict-engine';

/**
 * VerifyModule — public verification endpoint.
 *
 * Wires the VerdictEngine with the DB, scan-event recorder, rate limiter,
 * enumeration detector, GeoIP, and event emitter.
 */
@Module({
  imports: [
    DatabaseModule,
    ScanEventsModule,
    RateLimitModule,
    GeoIpModule,
    EventEmitterModule,
  ],
  controllers: [VerifyController],
  providers: [VerdictEngine],
})
export class VerifyModule {}
