import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ReportsRetentionService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async purgeContact(before: Date): Promise<number> {
    const result = await this.prisma.report.updateMany({
      where: {
        createdAt: { lt: before },
        contactPurgedAt: null,
        OR: [{ contactEmail: { not: null } }, { contactPhone: { not: null } }],
      },
      data: {
        contactEmail: null,
        contactPhone: null,
        contactPurgedAt: new Date(),
      },
    });
    return result.count;
  }
}
