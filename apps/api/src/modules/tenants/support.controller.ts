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
import {
  AllowWhenSuspended,
  RequireTenantStatus,
} from '../../common/tenant-status/decorators';
import { TenantLifecycleService } from './tenant-lifecycle.service';
import { TenantS3Service } from './s3.service';

@Controller('support')
export class SupportTenantsController {
  constructor(
    private readonly lifecycle: TenantLifecycleService,
    private readonly storage: TenantS3Service,
  ) {}
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
    const documents = await prisma.verificationDocument.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      documents.map(async (document) => ({
        ...document,
        viewUrl: await this.storage.presignGet(document.objectKey, 300),
      })),
    );
  }
  @Post('tenants/:tenantId/approve')
  @RequireTenantStatus('in_review')
  async approve(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle
      .transition(id, 'active', req.principal!.userId)
      .then(() =>
        this.lifecycle.addReviewNote(
          id,
          req.principal!.userId,
          'Tenant approved',
        ),
      )
      .then(() => this.lifecycle.get(id));
  }
  @Post('tenants/:tenantId/reject')
  @RequireTenantStatus('in_review')
  async reject(
    @Param('tenantId') id: string,
    @Body() body: { reason: string; canResubmit?: boolean },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle
      .transition(
        id,
        body.canResubmit ? 'pending' : 'rejected',
        req.principal!.userId,
        body.reason,
      )
      .then(() =>
        this.lifecycle.addReviewNote(id, req.principal!.userId, body.reason),
      )
      .then(() => this.lifecycle.get(id));
  }
  @Post('tenants/:tenantId/suspend')
  @AllowWhenSuspended()
  async suspend(
    @Param('tenantId') id: string,
    @Body() body: { reason: string; note?: string },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle
      .transition(
        id,
        'suspended',
        req.principal!.userId,
        body.note ?? body.reason,
      )
      .then(() =>
        this.lifecycle.addReviewNote(
          id,
          req.principal!.userId,
          body.note ?? body.reason,
        ),
      )
      .then(() => this.lifecycle.get(id));
  }
  @Post('tenants/:tenantId/reactivate')
  @AllowWhenSuspended()
  async reactivate(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    this.ensureSupport(req);
    return this.lifecycle
      .transition(id, 'active', req.principal!.userId)
      .then(() =>
        this.lifecycle.addReviewNote(
          id,
          req.principal!.userId,
          'Tenant reactivated',
        ),
      )
      .then(() => this.lifecycle.get(id));
  }
}
