import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OemsService } from './oems.service';
import { CreateOemDto } from './dto/create-oem.dto';
import { UpdateOemDto } from './dto/update-oem.dto';
import { SetOemStatusDto } from './dto/set-oem-status.dto';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('tenants/:tenantId/oems')
export class OemsController {
  constructor(private oemsService: OemsService) {}

  @Get()
  @Roles('viewer')
  list(@TenantId() tenantId: string) {
    return this.oemsService.list(tenantId);
  }

  @Post()
  @Roles('operator')
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateOemDto) {
    return this.oemsService.create(tenantId, dto);
  }

  @Get(':oemId')
  @Roles('viewer')
  get(@TenantId() tenantId: string, @Param('oemId') oemId: string) {
    return this.oemsService.get(tenantId, oemId);
  }

  @Patch(':oemId')
  @Roles('operator')
  update(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Body() dto: UpdateOemDto,
  ) {
    return this.oemsService.update(tenantId, oemId, dto);
  }

  @Post(':oemId/status')
  @Roles('owner')
  setStatus(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Body() dto: SetOemStatusDto,
  ) {
    return this.oemsService.setStatus(tenantId, oemId, dto.status);
  }
}
