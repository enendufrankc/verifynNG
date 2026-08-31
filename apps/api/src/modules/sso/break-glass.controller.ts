import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { BreakGlassService } from './break-glass.service';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

interface BreakGlassBody {
  email: string;
  password: string;
  totp: string;
}

@Controller('auth/break-glass')
export class BreakGlassController {
  constructor(private readonly breakGlass: BreakGlassService) {}

  @Public()
  @Post(':tenantSlug')
  attempt(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: BreakGlassBody,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.breakGlass.attempt(
      tenantSlug,
      body.email,
      body.password,
      body.totp,
      req.ip,
    );
  }
}
