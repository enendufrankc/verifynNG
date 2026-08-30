import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../../common/tenant';
import { PageEventsService } from './page-events.service';
import { PageEventDto } from './dto/page-event.dto';

@Controller('v1/events/page')
export class PageEventsController {
  constructor(
    // Explicit @Inject(PageEventsService) — see RollupCountersSubscriber's
    // constructor comment (tsx/esbuild decorator metadata gap; jobs:run only).
    @Inject(PageEventsService) private readonly pageEvents: PageEventsService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
  ) {}

  // Always 204, even for an unknown tenantSlug or a malformed-but-parseable
  // body — this endpoint never confirms or denies that a tenant exists.
  @Public()
  @Post()
  @HttpCode(204)
  async record(@Body() dto: PageEventDto): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
      select: { id: true },
    });
    if (!tenant) return;
    await this.pageEvents.record(
      tenant.id,
      dto.route,
      dto.referrerType,
      dto.locale,
    );
  }
}
