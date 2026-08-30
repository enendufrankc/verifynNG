import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Public()
  @Get('health')
  getHealth() {
    return this.healthService.getLiveness();
  }

  @Public()
  @Get('ready')
  getReady() {
    return this.healthService.getReadiness();
  }
}
