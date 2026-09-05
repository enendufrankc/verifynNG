import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv, envSchema } from '@verifynng/config';
import { PrismaModule } from '../../common/prisma.module';
import { EventsModule } from '../../common/events.module';
import { InvoiceService } from './invoice.service';
import { UsageReadService } from '../metering/usage-read.service';

/**
 * Minimal bootstrap root for `pnpm --filter api cli billing:run-invoices`
 * (mirrors JobsRunnerModule's rationale): `InvoiceService` and its one real
 * dependency, `UsageReadService`, provided directly rather than via
 * `BillingModule`/`MeteringModule` — those pull in `TenantsModule`, whose
 * `TenantOffboardingProcessor` has a constructor param tsx's ESM interop
 * can't resolve (several other files in this repo hit and documented the
 * same decorator-metadata gap; `nest build`'s real `tsc` output is
 * unaffected, only this tsx-run CLI is).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
      load: [() => loadEnv()],
    }),
    PrismaModule,
    EventsModule,
  ],
  providers: [InvoiceService, UsageReadService],
})
export class BillingCliModule {}
