import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../common/tenant';
import { StatusService } from './status.service';
import type { IngestProbeDto } from './status.service';

// Public status surface (E17). Verification lives in E06's VerifyController — this
// controller must never register a /v1/verify route (it shadowed E06's on main).
@Controller('v1')
@Public()
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Post('status/probe')
  async ingestProbe(
    @Body() dto: IngestProbeDto,
    @Headers('x-synthetic-probe') probeHeader?: string,
  ) {
    const expectedKey = process.env.PROBE_KEY || 'probe-secret-local';
    if (probeHeader !== expectedKey) {
      throw new UnauthorizedException('Invalid synthetic probe key');
    }
    return this.statusService.ingestProbe(dto);
  }

  @Get('status')
  async getStatus() {
    return this.statusService.getOverallStatus();
  }

  @Get('status/history')
  async getHistory(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.statusService.getHistory(daysNum);
  }
}
