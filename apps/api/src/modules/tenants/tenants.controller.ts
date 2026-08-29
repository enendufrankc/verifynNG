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
  ForbiddenException,
} from '@nestjs/common';
import { PrincipalRequest } from '../../common/principal';
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
      ownerUserId: req.principal?.userId ?? 'development-user',
      ownerEmail: req.principal?.email,
    });
  }
  @Get('tenants/:tenantId') get(@Param('tenantId') id: string): Promise<any> {
    return this.lifecycle.get(id);
  }
  @Patch('tenants/:tenantId/settings')
  @RequireTenantStatus('pending', 'in_review', 'rejected', 'active')
  update(
    @Param('tenantId') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: PrincipalRequest,
  ) {
    return this.lifecycle
      .pendingAcceptances(req.principal?.userId ?? 'development-user', id)
      .then((pending) => {
        if (pending.length)
          throw new ForbiddenException({
            error: 'policy_acceptance_required',
            pending,
          });
        return this.lifecycle.updateSettings(id, body);
      });
  }
  @Post('tenants/:tenantId/verification/submit')
  @RequireTenantStatus('pending', 'rejected')
  submit(@Param('tenantId') id: string) {
    return this.lifecycle.submitForReview(id);
  }
  @Get('tenants/:tenantId/verification') verification(
    @Param('tenantId') id: string,
  ): Promise<any> {
    return this.lifecycle.verification(id);
  }
  @Post('tenants/:tenantId/verification/documents') document(
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
      uploadedBy: req.principal?.userId ?? 'development-user',
    });
  }
  @Post('tenants/:tenantId/verification/documents/:documentId/complete')
  complete(
    @Param('tenantId') id: string,
    @Param('documentId') documentId: string,
  ): Promise<any> {
    return this.lifecycle.completeDocument(id, documentId);
  }
  @Delete('tenants/:tenantId/verification/documents/:documentId') remove(
    @Param('tenantId') id: string,
    @Param('documentId') documentId: string,
  ): Promise<any> {
    return this.lifecycle.deleteDocument(id, documentId);
  }
  @Post('tenants/:tenantId/policies/accept') @AllowWhenSuspended() accept(
    @Param('tenantId') id: string,
    @Body() body: { kind: 'aup' | 'tos'; version: string },
    @Req() req: PrincipalRequest,
  ) {
    return this.lifecycle.acceptPolicy(
      req.principal?.userId ?? 'development-user',
      id,
      body.kind,
      body.version,
    );
  }
  @Post('tenants/:tenantId/offboard') @AllowWhenSuspended() offboard(
    @Param('tenantId') id: string,
    @Body() body: { confirmSlug: string },
    @Req() req: PrincipalRequest,
  ) {
    return this.lifecycle.offboard(
      id,
      req.principal?.userId ?? 'development-user',
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
        req.principal?.userId ?? 'development-user',
        id,
      ),
    ]).then(([current, pending]) => ({ current, pending }));
  }
  @Get('tenants/:tenantId/export') export(
    @Param('tenantId') id: string,
  ): Promise<any> {
    return this.lifecycle.getExport(id);
  }
  @Get('policies/:kind/current') current(@Param('kind') kind: string) {
    return (this.lifecycle as any)
      .currentVersions()
      .then((versions: any) => ({
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
