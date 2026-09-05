import { Controller, Get, Inject } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { PlanService } from './plan.service';

// No @Roles — any authenticated principal (any tenant role, any platform
// role) may list plans; TenantContextGuard already requires a valid JWT.
@Controller('v1/billing')
export class PlansController {
  constructor(@Inject(PlanService) private readonly plans: PlanService) {}

  @Get('plans')
  list(): Promise<Plan[]> {
    return this.plans.list();
  }
}
