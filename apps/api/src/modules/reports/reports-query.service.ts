import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class ReportsQueryService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async forUnit(unitId: string): Promise<{ count: number }> {
    const count = await this.prisma.report.count({ where: { unitId } });
    return { count };
  }

  async forBatch(batchId: string): Promise<{ count: number }> {
    const count = await this.prisma.report.count({ where: { batchId } });
    return { count };
  }
}
