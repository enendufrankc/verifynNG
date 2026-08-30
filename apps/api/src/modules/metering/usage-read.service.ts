import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, UsageEvent } from '@prisma/client';
import { ALL_USAGE_KINDS, toDottedKind } from './usage-kind.util';

export interface UsageSummaryResponse {
  month: string;
  kinds: Record<string, number>;
  finalisedAt: string | null;
}

export interface UsageEventsPage {
  events: UsageEvent[];
  nextCursor: string | null;
}

@Injectable()
export class UsageReadService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async summary(
    tenantId: string,
    month: string,
  ): Promise<UsageSummaryResponse> {
    const rows = await this.prisma.usageSummary.findMany({
      where: { tenantId, month },
    });

    const kinds: Record<string, number> = {};
    for (const kind of ALL_USAGE_KINDS) kinds[toDottedKind(kind)] = 0;

    let finalisedAt: Date | null = null;
    for (const row of rows) {
      kinds[toDottedKind(row.kind)] = row.quantity;
      if (row.finalisedAt) finalisedAt = row.finalisedAt;
    }

    return { month, kinds, finalisedAt: finalisedAt?.toISOString() ?? null };
  }

  async raw(
    tenantId: string,
    opts: { from?: Date; to?: Date; cursor?: string; limit?: number } = {},
  ): Promise<UsageEventsPage> {
    const limit = opts.limit ?? 100;
    const rows = await this.prisma.usageEvent.findMany({
      where: {
        tenantId,
        ...(opts.from || opts.to
          ? { occurredAt: { gte: opts.from, lte: opts.to } }
          : {}),
      },
      orderBy: { occurredAt: 'asc' },
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    return {
      events,
      nextCursor: hasMore ? events[events.length - 1].id : null,
    };
  }
}
