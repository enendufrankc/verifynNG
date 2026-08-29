import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipService } from './members.service';
import { InviteDto } from './dto/invite.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Principal } from '../auth/decorators/principal.decorator';

@Controller('tenants/:tenantId/members')
export class MembersController {
  constructor(private membersService: MembershipService) {}

  @Get()
  @Roles('viewer')
  async list(@TenantId() tenantId: string) {
    return this.membersService.listForTenant(tenantId);
  }

  @Post('invite')
  @Roles('owner')
  async invite(
    @TenantId() tenantId: string,
    @Principal() principal: any,
    @Body() dto: InviteDto,
  ) {
    return this.membersService.invite(
      tenantId,
      dto.email,
      dto.role,
      principal.userId,
    );
  }

  @Patch(':userId')
  @Roles('owner')
  async changeRole(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Principal() principal: any,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.membersService.setRole(
      tenantId,
      userId,
      dto.role,
      principal.userId,
    );
  }

  @Delete(':userId')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Principal() principal: any,
  ) {
    return this.membersService.remove(tenantId, userId, principal.userId);
  }
}
