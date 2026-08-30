/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { PrincipalRequest } from '../../common/principal';
import { Public, Roles } from '../../common/tenant';
import {
  AllowWhenSuspended,
  RequireTenantStatus,
} from '../../common/tenant-status/decorators';
import { TenantLifecycleService } from './tenant-lifecycle.service';

@Controller()
export class TenantsController {
  constructor(private readonly lifecycle: TenantLifecycleService) {}
  @Post('tenants') create(
    @Body()
    body: {
      name: string;
      legalName?: string;
      country: string;
      acceptPolicies?: { aup?: string; tos?: string };
    },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    return this.lifecycle.create({
      name: body.name,
      legalName: body.legalName,
      country: body.country,
      acceptPolicies: body.acceptPolicies,
      ownerUserId: req.principal!.userId,
      ownerEmail: req.principal?.email,
    });
  }
  @Get('tenants/:tenantId') get(@Param('tenantId') id: string): Promise<any> {
    return this.lifecycle.get(id);
  }
  @Roles('owner')
  @Patch('tenants/:tenantId/settings')
  @RequireTenantStatus('pending', 'in_review', 'rejected', 'active')
  update(
    @Param('tenantId') id: string,
    @Body() body: Record<string, unknown>,
    @Req() _req: PrincipalRequest,
  ) {
    return this.lifecycle.updateSettings(id, body);
  }
  @Roles('owner')
  @Post('tenants/:tenantId/verification/submit')
  @RequireTenantStatus('pending', 'rejected')
  submit(@Param('tenantId') id: string, @Req() _req: PrincipalRequest) {
    return this.lifecycle.submitForReview(id);
  }
  @Get('tenants/:tenantId/verification') verification(
    @Param('tenantId') id: string,
  ): Promise<any> {
    return this.lifecycle.verification(id);
  }
  @Roles('owner')
  @Post('tenants/:tenantId/verification/documents')
  @RequireTenantStatus('pending', 'rejected', 'in_review', 'active')
  document(
    @Param('tenantId') id: string,
    @Body()
    body: {
      kind:
        | 'cac_certificate'
        | 'trademark_certificate'
        | 'director_id'
        | 'other';
      fileName: string;
      contentType: string;
      size: number;
    },
    @Req() req: PrincipalRequest,
  ): Promise<any> {
    return this.lifecycle.createDocument(id, {
      ...body,
      uploadedBy: req.principal!.userId,
    });
  }
  @Roles('owner')
  @Post('tenants/:tenantId/verification/documents/:documentId/complete')
  @RequireTenantStatus('pending', 'rejected', 'in_review', 'active')
  complete(
    @Param('tenantId') id: string,
    @Param('documentId') documentId: string,
    @Req() _req: PrincipalRequest,
  ): Promise<any> {
    return this.lifecycle.completeDocument(id, documentId);
  }
  @Roles('owner')
  @Delete('tenants/:tenantId/verification/documents/:documentId')
  @RequireTenantStatus('pending', 'rejected')
  remove(
    @Param('tenantId') id: string,
    @Param('documentId') documentId: string,
    @Req() _req: PrincipalRequest,
  ): Promise<any> {
    return this.lifecycle.deleteDocument(id, documentId);
  }
  @Roles('owner')
  @Post('tenants/:tenantId/policies/accept')
  @RequireTenantStatus('pending', 'rejected', 'in_review', 'active')
  @AllowWhenSuspended()
  accept(
    @Param('tenantId') id: string,
    @Body() body: { kind: 'aup' | 'tos'; version: string },
    @Req() req: PrincipalRequest,
  ) {
    return this.lifecycle.acceptPolicy(
      req.principal!.userId,
      id,
      body.kind,
      body.version,
    );
  }
  @Roles('owner')
  @Post('tenants/:tenantId/offboard') @AllowWhenSuspended() offboard(
    @Param('tenantId') id: string,
    @Body() body: { confirmSlug: string },
    @Req() req: PrincipalRequest,
  ) {
    return this.lifecycle.offboard(
      id,
      req.principal!.userId,
      body.confirmSlug,
    );
  }
  @Get('tenants/:tenantId/policies') policies(
    @Param('tenantId') id: string,
    @Req() req: PrincipalRequest,
  ) {
    return Promise.all([
      this.lifecycle.currentVersions(),
      this.lifecycle.pendingAcceptances(
        req.principal!.userId,
        id,
      ),
    ]).then(([current, pending]) => ({ current, pending }));
  }
  @Get('tenants/:tenantId/export') export(
    @Param('tenantId') id: string,
  ): Promise<any> {
    return this.lifecycle.getExport(id);
  }
  @Public()
  @Get('policies/:kind/current') current(@Param('kind') kind: string) {
    return (this.lifecycle as any).currentVersions().then((versions: any) => ({
      kind,
      version: versions[kind],
      effectiveFrom: '2026-08-01',
      markdown:
        kind === 'aup'
          ? 'Only authenticate goods for marks you own or are authorised to represent.'
          : 'The platform may suspend accounts when there is evidence of counterfeiting.',
    }));
  }
}
