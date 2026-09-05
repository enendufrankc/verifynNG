import { Inject, Injectable } from '@nestjs/common';
import { Plan, PrismaClient } from '@prisma/client';
import { seedPlans } from '@verifynng/db';

@Injectable()
export class PlanService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async list(): Promise<Plan[]> {
    return this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getByCode(code: string): Promise<Plan | null> {
    return this.prisma.plan.findUnique({ where: { code } });
  }

  /** Re-runs the plan catalogue seed. Used by `pnpm db:seed` and tests. */
  async seed(): Promise<void> {
    await seedPlans(this.prisma);
  }
}
