import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { MfaPolicyService, type SetMfaPolicyDto } from './mfa-policy.service';

const VALID_ROLES = ['owner', 'operator', 'viewer'];

@Controller('tenants/:tenantId/security/mfa-policy')
export class MfaPolicyController {
  constructor(private readonly mfaPolicy: MfaPolicyService) {}

  @Get()
  @Roles('viewer')
  async get(@TenantId() tenantId: string) {
    const policy = await this.mfaPolicy.get(tenantId);
    const affected = await this.mfaPolicy.listUnenrolledAffected(tenantId);
    return {
      requiredRoles: policy?.requiredRoles ?? [],
      gracePeriodDays: policy?.gracePeriodDays ?? 7,
      enforcedFrom: policy?.enforcedFrom ?? null,
      affectedMembers: affected,
    };
  }

  @Put()
  @Roles('owner')
  async set(
    @TenantId() tenantId: string,
    @Body() dto: SetMfaPolicyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (
      !Array.isArray(dto.requiredRoles) ||
      dto.requiredRoles.some((r) => !VALID_ROLES.includes(r))
    ) {
      throw new BadRequestException(
        'requiredRoles must be a subset of owner|operator|viewer',
      );
    }
    if (typeof dto.gracePeriodDays !== 'number' || dto.gracePeriodDays < 0) {
      throw new BadRequestException(
        'gracePeriodDays must be a non-negative number',
      );
    }
    return this.mfaPolicy.set(tenantId, dto, req.user?.userId, req.ip);
  }
}
