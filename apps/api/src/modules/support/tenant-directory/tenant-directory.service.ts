import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface TenantDirectoryRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  ownerEmail: string | null;
  unitsThisYear: number;
  scansLast30d: number;
  lastActivityAt: string | null;
  /** E15 hasn't shipped a plan/subscription model yet — see CROSS-EPIC-REQUESTS.md. */
  planCode: null;
}

export interface TenantDirectoryPage {
  items: TenantDirectoryRow[];
  cursor?: string;
}

@Injectable()
export class TenantDirectoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: {
    q?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<TenantDirectoryPage> {
    const limit = Math.min(filter.limit ?? 50, 200);

    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: 'insensitive' } },
                { slug: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      cursor: filter.cursor ? { id: filter.cursor } : undefined,
      skip: filter.cursor ? 1 : 0,
      take: limit + 1,
    });

    let cursor: string | undefined;
    if (tenants.length > limit) {
      cursor = tenants.pop()!.id;
    }

    const items = await Promise.all(
      tenants.map((tenant) => this.toRow(tenant.id, tenant)),
    );
    return { items, cursor };
  }

  async get(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('tenant_not_found');

    const [row, recentAudit] = await Promise.all([
      this.toRow(tenantId, tenant),
      this.prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { seq: 'desc' },
        take: 10,
      }),
    ]);
    return { ...row, recentAudit };
  }

  private async toRow(
    tenantId: string,
    tenant: {
      slug: string;
      name: string;
      status: string;
    },
  ): Promise<TenantDirectoryRow> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [ownerMembership, mintAgg, scanCount, lastAudit] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { tenantId, role: 'owner' },
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.batch.aggregate({
        where: { tenantId, createdAt: { gte: yearStart } },
        _sum: { mintedCount: true },
      }),
      this.prisma.scanEvent.count({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.auditLog.findFirst({
        where: { tenantId },
        orderBy: { seq: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      id: tenantId,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      ownerEmail: ownerMembership?.user.email ?? null,
      unitsThisYear: mintAgg._sum.mintedCount ?? 0,
      scansLast30d: scanCount,
      lastActivityAt: lastAudit?.createdAt.toISOString() ?? null,
      planCode: null,
    };
  }
}
