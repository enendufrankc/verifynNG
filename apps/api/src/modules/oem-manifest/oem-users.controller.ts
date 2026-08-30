import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Principal } from '../auth/decorators/principal.decorator';
import type { UserPrincipal } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator';
import { OemUserService } from './oem-user.service';
import { InviteOemUserDto } from './dto/invite-oem-user.dto';

@Controller('tenants/:tenantId/oems/:oemId/users')
export class OemUsersController {
  constructor(private oemUserService: OemUserService) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string, @Param('oemId') oemId: string) {
    return this.oemUserService.list(tenantId, oemId);
  }

  @Post()
  @Roles('owner')
  @HttpCode(HttpStatus.CREATED)
  @Audited('oem.user.invite', {
    target: (req) => ({ type: 'oem', id: req.params.oemId as string }),
  })
  invite(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Body() dto: InviteOemUserDto,
    @Principal() principal: UserPrincipal,
  ) {
    return this.oemUserService.invite(tenantId, oemId, dto, principal.userId);
  }

  @Delete(':oemUserId')
  @Roles('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('oem.user.remove', {
    target: (req) => ({ type: 'oem', id: req.params.oemId as string }),
  })
  remove(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Param('oemUserId') oemUserId: string,
  ) {
    return this.oemUserService.remove(tenantId, oemId, oemUserId);
  }
}
