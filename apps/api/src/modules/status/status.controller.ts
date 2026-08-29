import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Query,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { StatusService, IngestProbeDto } from './status.service';

@Controller('v1')
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

  // Probe fixture verify target stub (until E06 verification module lands)
  @Get('verify/:code')
  async verifyCode(
    @Param('code') code: string,
    @Headers('x-synthetic-probe') probeHeader?: string,
    @Headers('x-debug-throw') debugThrow?: string,
  ) {
    if (debugThrow === '1' && process.env.NODE_ENV !== 'production') {
      throw new Error('Deliberate error thrown via x-debug-throw header');
    }

    const probeFixture = process.env.PROBE_FIXTURE_CODE || 'PROBE_TIER1_OK';

    if (code === probeFixture || probeHeader) {
      const delayMs = Number(process.env.VERIFY_ARTIFICIAL_DELAY_MS) || 0;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return {
        verdict: 'ok',
        tier: 1,
        code,
        probe: true,
      };
    }

    return {
      verdict: 'ok',
      tier: 1,
      code,
    };
  }
}
