import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PlatformRole, Principal } from '../../../common/tenant';
import type { UserPrincipal } from '../../auth/types/principal';
import { StartImpersonationDto } from './dto/start-impersonation.dto';
import { ImpersonationService } from './impersonation.service';

@Controller('v1/platform/impersonation')
@PlatformRole('support')
export class ImpersonationController {
  constructor(private readonly impersonation: ImpersonationService) {}

  @Post()
  start(
    @Principal() principal: UserPrincipal,
    @Body() dto: StartImpersonationDto,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.impersonation.start(
      principal.userId,
      dto.tenantId,
      { mode: dto.mode, reason: dto.reason },
      { userAgent },
    );
  }

  @Get('active')
  active(@Principal() principal: UserPrincipal) {
    return this.impersonation.active(principal.userId);
  }

  @Get()
  history(@Req() req: Request) {
    const cursor =
      typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    return this.impersonation.history({ cursor });
  }

  @Delete(':sessionId')
  end(
    @Principal() principal: UserPrincipal,
    @Param('sessionId') sessionId: string,
  ) {
    return this.impersonation.endAsUser(principal.userId, sessionId);
  }
}
