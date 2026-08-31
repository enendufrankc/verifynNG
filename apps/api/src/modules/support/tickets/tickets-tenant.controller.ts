import { Body, Controller, Get, Post } from '@nestjs/common';
import { Principal, Roles, TenantId } from '../../../common/tenant';
import type { UserPrincipal } from '../../auth/types/principal';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketsService } from './tickets.service';

@Controller('v1/tenants/:tenantId/support/tickets')
export class TicketsTenantController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  @Roles('viewer')
  create(
    @TenantId() tenantId: string,
    @Principal() principal: UserPrincipal,
    @Body() dto: CreateTicketDto,
  ) {
    return this.tickets.createFromConsole(tenantId, principal.userId, dto);
  }

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string, @Principal() principal: UserPrincipal) {
    return this.tickets.listForTenant(tenantId, principal.userId);
  }
}
