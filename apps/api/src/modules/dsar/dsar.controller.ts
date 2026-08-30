import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PlatformRole,
  Principal,
  Public,
  Roles,
  TenantId,
} from '../../common/tenant';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import { LegalHoldService } from './legal-hold.service';
import { DsarService } from './dsar.service';
import type { DsarAction, LegalHoldScope } from '@prisma/client';

@Controller('v1/dsar')
export class DsarController {
  constructor(private readonly dsar: DsarService) {}

  @Public()
  @Post('consumer')
  @HttpCode(202)
  async requestConsumer(
    @Body()
    body: {
      referenceNumber: string;
      email: string;
      action: DsarAction;
    },
  ) {
    await this.dsar.requestConsumer(body);
    return { status: 'accepted' };
  }

  @Public()
  @Post('consumer/verify')
  verifyConsumer(@Body() body: { token: string }) {
    return this.dsar.verifyConsumer(body.token);
  }

  @Public()
  @Get('consumer/:id/download')
  async downloadConsumer(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const url = await this.dsar.downloadConsumerExportUrl(id, token);
    res.redirect(302, url);
  }

  @Roles('owner')
  @Post('tenant')
  @HttpCode(202)
  @Audited('dsar.tenant.requested')
  requestTenant(
    @TenantId() tenantId: string,
    @Principal() principal: UserPrincipal,
    @Body() _body: { action: 'export' },
  ) {
    return this.dsar.requestTenantExport(tenantId, principal.userId);
  }

  @Roles('owner')
  @Get('tenant/:id')
  getTenant(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.dsar.getTenantDsar(tenantId, id);
  }
}

@Controller('v1/legal-holds')
export class LegalHoldController {
  constructor(private readonly legalHold: LegalHoldService) {}

  @PlatformRole('support')
  @Post()
  @Audited('legal_hold.created')
  create(
    @Principal() principal: UserPrincipal,
    @Body()
    body: {
      tenantId?: string;
      scope: LegalHoldScope;
      ref: string;
      reason: string;
    },
  ) {
    return this.legalHold.create({ ...body, createdById: principal.userId });
  }

  @PlatformRole('support')
  @Post(':id/release')
  @Audited('legal_hold.released')
  release(@Param('id') id: string) {
    return this.legalHold.release(id);
  }
}
