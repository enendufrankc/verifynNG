import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../common/public.decorator';
import { ReportsRetentionService } from './reports-retention.service';
import { InMemoryConsent } from './consent/in-memory-consent.provider';

/**
 * Dev-only reports harness.
 * Present only when NODE_ENV !== 'production' (see ReportsModule).
 * Backs E08's Playwright fixtures and AC5/AC7/AC8 manual verification.
 */
@Controller('v1/_dev/reports')
@Public()
export class ReportsDevController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly retention: ReportsRetentionService,
    private readonly consent: InMemoryConsent,
  ) {}

  @Post('seed')
  async seed(@Body() body: { tenantSlug?: string } = {}) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { slug: body.tenantSlug ?? 'ivoryglow' },
    });

    // Re-runnable: clear this tenant's previously seeded reports first, so
    // repeated E2E runs don't hit the `reference` unique constraint.
    await this.prisma.report.deleteMany({
      where: { tenantId: tenant.id, reference: { startsWith: 'RPT-SEED' } },
    });

    const statuses = ['new', 'triaged', 'investigating', 'closed'] as const;
    const created = [];
    for (let i = 0; i < 20; i++) {
      const status = statuses[i % statuses.length];
      const report = await this.prisma.report.create({
        data: {
          tenantId: tenant.id,
          reference: `RPT-SEED${String(i).padStart(2, '0')}`,
          verdictAtReport: i % 3 === 0 ? 'red' : 'amber',
          purchaseChannel: 'open_market',
          ipHash: `seed-${i}`,
          status,
          outcome: status === 'closed' ? 'confirmed_counterfeit' : undefined,
        },
      });
      created.push(report.id);
    }
    return { created: created.length };
  }

  @Get('consents')
  async consents() {
    return this.consent.list();
  }

  @Post('purge-contact')
  async purgeContact(@Query('before') before: string) {
    const purged = await this.retention.purgeContact(
      before ? new Date(before) : new Date(),
    );
    return { purged };
  }
}
