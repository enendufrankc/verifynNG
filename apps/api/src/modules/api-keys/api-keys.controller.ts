import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { TenantId } from '../auth/decorators/tenant-id.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Principal } from '../auth/decorators/principal.decorator.js';
import { isApiClientPrincipal } from '../auth/types/principal.js';
import type { Principal as PrincipalType } from '../auth/types/principal.js';
import { Audited } from '../audit/audited.decorator.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { ApiKeyService } from './api-key.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';

function userIdOf(principal: PrincipalType | undefined): string | undefined {
  return principal && !isApiClientPrincipal(principal)
    ? principal.userId
    : undefined;
}

const apiKeyAuditTarget = (req: AuthenticatedRequest) => ({
  type: 'api-key',
  id: (req.params?.id as string) ?? 'unknown',
});

@Controller('tenants/:tenantId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string) {
    return this.apiKeys.list(tenantId);
  }

  @Post()
  @Roles('owner')
  @Audited('apikey.create', { target: apiKeyAuditTarget })
  create(
    @TenantId() tenantId: string,
    @Body() dto: CreateApiKeyDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.apiKeys.create(tenantId, {
      name: dto.name,
      scopes: dto.scopes,
      mode: dto.mode,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdById: userIdOf(principal) ?? 'unknown',
    });
  }

  @Delete(':id')
  @Roles('owner')
  @Audited('apikey.revoke', { target: apiKeyAuditTarget })
  revoke(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Principal() principal?: PrincipalType,
  ) {
    return this.apiKeys.revoke(tenantId, id, userIdOf(principal) ?? 'unknown');
  }
}
