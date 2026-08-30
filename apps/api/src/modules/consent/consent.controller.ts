import { Body, Controller, Get, Post } from '@nestjs/common';
import type { ConsentPurpose } from '@prisma/client';
import { Principal, TenantId } from '../../common/tenant';
import type { UserPrincipal } from '../auth/types/principal';
import { ConsentService } from './consent.service';

@Controller('v1/consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Post()
  record(
    @TenantId() tenantId: string,
    @Principal() principal: UserPrincipal,
    @Body() body: { purpose: ConsentPurpose; granted: boolean },
  ) {
    return this.consent.record({
      tenantId,
      subjectType: 'user',
      subjectRef: principal.userId,
      purpose: body.purpose,
      granted: body.granted,
      source: 'admin_preferences',
    });
  }

  @Get('me')
  me(@Principal() principal: UserPrincipal) {
    return this.consent.history('user', principal.userId);
  }
}
