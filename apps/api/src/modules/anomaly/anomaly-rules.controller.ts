import { Body, Controller, Get, Put } from '@nestjs/common';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Audited } from '../audit/audited.decorator.js';
import { RulesService } from './rules/rules.service';
import { UpdateRulesDto } from './dto/update-rules.dto';

@Controller('v1/anomaly-rules')
export class AnomalyRulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @Roles('viewer')
  get(@TenantId() tenantId: string) {
    return this.rules.effective(tenantId);
  }

  @Put()
  @Roles('owner')
  @Audited('anomaly.rules.update')
  update(@TenantId() tenantId: string, @Body() dto: UpdateRulesDto) {
    return this.rules.update(tenantId, dto);
  }
}
