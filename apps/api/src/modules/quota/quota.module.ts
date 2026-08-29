/**
 * QuotaModule — Redis-backed tenant quotas.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuotaService } from './quota.service.js';
import { QuotaExceededFilter } from './quota-error.filter.js';
import {
  QuotaController,
  SupportQuotaController,
  DevQuotaController,
} from './quota.controller.js';
import { APP_FILTER } from '@nestjs/core';
import Redis from 'ioredis';

const devControllers =
  process.env.NODE_ENV === 'production' ? [] : [DevQuotaController];

@Global()
@Module({
  controllers: [QuotaController, SupportQuotaController, ...devControllers],
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
