/**
 * Dev-only audit demo controller.
 * Present only when NODE_ENV !== 'production'.
 * Used by AC1 to test @Audited() and chain integrity.
 */

import { Controller, Post, Get, Req } from '@nestjs/common';
import { Public } from '../../common/tenant';
import { Audited } from './audited.decorator.js';
import { AuditService } from './audit.service.js';
import { AuditChainService } from './audit-chain.service.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';

@Controller('v1/_dev/audit-demo')
@Public()
export class DevAuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly chainService: AuditChainService,
  ) {}

  @Post()
  @Audited('demo.touch')
  async touch() {
    // The @Audited decorator handles the audit recording.
    // Return a simple confirmation.
    return { ok: true, message: 'demo.touch recorded' };
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.auditService.query({
      tenantId: req?.user?.tenantId,
      limit: 50,
    });
  }
}
