/**
 * QuotaModule — Redis-backed tenant quotas.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { QuotaService } from './quota.service.js';
import { QuotaExceededFilter } from './quota-error.filter.js';
import { APP_FILTER } from '@nestjs/core';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new Redis(configService.get<string>('REDIS_URL')!);
      },
      inject: [ConfigService],
    },
    QuotaService,
    {
      provide: APP_FILTER,
      useClass: QuotaExceededFilter,
    },
  ],
  exports: [QuotaService, 'REDIS_CLIENT'],
})
export class QuotaModule {}
