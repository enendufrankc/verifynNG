import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  PlatformRole,
  Principal,
  Public,
  Roles,
  TenantId,
} from '../../common/tenant';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import { ConsentService } from '../consent/consent.service';
import { TenantLifecycleService } from '../tenants/tenant-lifecycle.service';
import {
  KIND_TO_DB,
  LEGAL_DOC_KINDS,
  LegalDocKind,
  LegalDocumentService,
} from './legal-document.service';

function assertKind(kind: string): LegalDocKind {
  if (!LEGAL_DOC_KINDS.includes(kind as LegalDocKind)) {
    throw new NotFoundException('legal_document_not_found');
  }
  return kind as LegalDocKind;
}

function assertAcceptableKind(kind: LegalDocKind): 'aup' | 'tos' {
  const dbKind = KIND_TO_DB[kind];
  if (dbKind !== 'aup' && dbKind !== 'tos') {
    throw new NotFoundException('legal_document_not_acceptable');
  }
  return dbKind;
}

@Controller('v1/legal')
export class LegalController {
  constructor(
    private readonly legal: LegalDocumentService,
    private readonly tenantLifecycle: TenantLifecycleService,
    private readonly consent: ConsentService,
  ) {}

  @Public()
  @Get('subprocessors')
  subprocessors(@Query('locale') locale?: string) {
    return this.legal.current('subprocessors', locale);
  }

  // Any tenant member may read this (not just `owner`) so operators/viewers
  // can render the "your owner must accept" banner — only accepting is
  // owner-only. @Roles(...) lets a platform-support principal through too
  // (RolesGuard bypasses tenant-role checks for platformRole === 'support'),
  // and such a caller has no tenant context at all — @TenantId() would
  // throw 500 for them, so this reads req.tenantId directly and treats
  // "no tenant" as "nothing to re-accept" rather than an error.
  @Roles('owner', 'operator', 'viewer')
  @Get('acceptance-status')
  acceptanceStatus(@Req() req: Request, @Principal() principal: UserPrincipal) {
    if (!req.tenantId) return [];
    return this.legal.needsReacceptance(req.tenantId, principal.userId);
  }

  @Roles('owner', 'operator', 'viewer')
  @Get('agreements')
  agreements(@TenantId() tenantId: string) {
    return this.legal.agreements(tenantId);
  }

  // Path must end with "/policies/accept" — TenantStatusGuard (E03) hardcodes
  // that suffix to bypass its own pending-acceptance block; any other path
  // would deadlock a blocked owner (never able to reach the very endpoint
  // that clears the block). See apps/api/src/common/tenant-status/tenant-status.guard.ts.
  @Roles('owner')
  @Post('policies/accept')
  @Audited('legal.accepted')
  async accept(
    @TenantId() tenantId: string,
    @Principal() principal: UserPrincipal,
    @Body() body: { kind: LegalDocKind; version: string },
  ) {
    const dbKind = assertAcceptableKind(body.kind);
    const acceptance = await this.tenantLifecycle.acceptPolicy(
      principal.userId,
      tenantId,
      dbKind,
      body.version,
    );
    await this.consent.record({
      tenantId,
      subjectType: 'user',
      subjectRef: principal.userId,
      purpose: 'terms_acceptance',
      granted: true,
      source: 'legal_reaccept',
      documentKind: dbKind,
      documentVersion: body.version,
    });
    return acceptance;
  }

  @PlatformRole('support')
  @Post(':kind/versions')
  publish(
    @Param('kind') kind: string,
    @Principal() principal: UserPrincipal,
    @Body()
    body: {
      version: string;
      bodyMd: string;
      locale?: string;
      changeSummary?: string;
      requiresReacceptance?: boolean;
    },
  ) {
    return this.legal.publish({
      kind: assertKind(kind),
      version: body.version,
      bodyMd: body.bodyMd,
      locale: body.locale,
      changeSummary: body.changeSummary,
      requiresReacceptance: body.requiresReacceptance,
      publishedById: principal.userId,
    });
  }

  @Public()
  @Get(':kind/versions')
  versions(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.list(assertKind(kind), locale);
  }

  @Public()
  @Get(':kind')
  current(@Param('kind') kind: string, @Query('locale') locale?: string) {
    return this.legal.current(assertKind(kind), locale);
  }
}
