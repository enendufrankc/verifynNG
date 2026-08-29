/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { prisma } from '@verifynng/db';
import { Req } from '@nestjs/common';
import { PrincipalRequest } from '../../common/principal';
import { TenantLifecycleService } from './tenant-lifecycle.service';

@Controller('support')
export class SupportTenantsController {
  constructor(private readonly lifecycle: TenantLifecycleService) {}
  private ensureSupport(req: PrincipalRequest) {
    if (req.principal?.platformRole !== 'support')
      throw new ForbiddenException('support_role_required');
  }
  @Get('tenants') async list(
    @Query('status') status = 'in_review',
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return prisma.tenant.findMany({
      where: { status: status as any },
      orderBy: { createdAt: 'asc' },
      include: { verificationDocuments: true },
    });
  }
  @Get('tenants/:tenantId/verification') async verification(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return prisma.verificationDocument.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('tenants/:tenantId/approve') async approve(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle.transition(id, 'active', req.principal!.userId);
  }
  @Post('tenants/:tenantId/reject') async reject(
    @Param('tenantId') id: string,
    @Body() body: { reason: string; canResubmit?: boolean },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle.transition(
      id,
      'rejected',
      req.principal!.userId,
      body.reason,
    );
  }
  @Post('tenants/:tenantId/suspend') async suspend(
    @Param('tenantId') id: string,
    @Body() body: { reason: string; note?: string },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle.transition(
      id,
      'suspended',
      req.principal!.userId,
      body.note ?? body.reason,
    );
  }
  @Post('tenants/:tenantId/reactivate') async reactivate(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle.transition(id, 'active', req.principal!.userId);
  }
}
