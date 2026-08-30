import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiClientService } from '../services/api-client.service';
import { Principal } from '../decorators/principal.decorator';
import { InternalOnly } from '../decorators/internal-only.decorator';
import { PlatformRole } from '../decorators/platform-role.decorator';
import type { ApiClientPrincipal } from '../types/principal';

@Controller('internal')
export class InternalController {
  constructor(private apiClientService: ApiClientService) {}

  @Get('whoami')
  @InternalOnly()
  whoami(@Principal() principal: ApiClientPrincipal) {
    return {
      apiClientId: principal.apiClientId,
      tenantId: principal.tenantId,
      scopes: principal.scopes,
    };
  }

  @Post('api-clients')
  @PlatformRole('support')
  async createApiClient(
    @Body() body: { name: string; tenantId?: string; scopes?: string[] },
  ) {
    return this.apiClientService.create(body.name, body.tenantId, body.scopes);
  }

  @Delete('api-clients/:id')
  @PlatformRole('support')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeApiClient(@Param('id') id: string) {
    await this.apiClientService.revoke(id);
  }
}
