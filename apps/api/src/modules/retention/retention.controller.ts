import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PlatformRole, Principal } from '../../common/tenant';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import { RetentionRunnerService } from './retention-runner.service';

@Controller('v1/retention')
export class RetentionController {
  constructor(private readonly runner: RetentionRunnerService) {}

  @PlatformRole('support')
  @Get('policies')
  policies() {
    return this.runner.listPolicies();
  }

  @PlatformRole('support')
  @Post('run')
  @Audited('retention.run')
  run(
    @Principal() principal: UserPrincipal,
    @Body() body: { dryRun: boolean; policy?: string },
  ) {
    return this.runner.run({
      dryRun: body.dryRun,
      policyName: body.policy,
      triggeredBy: principal.userId,
    });
  }

  @PlatformRole('support')
  @Get('runs')
  runs(@Query('policy') policy?: string) {
    return this.runner.listRuns(policy);
  }
}
