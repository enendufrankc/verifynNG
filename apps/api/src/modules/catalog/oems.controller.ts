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

@Controller('tenants/:tenantId/oems')
export class OemsController {
  constructor(private oemsService: OemsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.oemsService.list(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@TenantId() tenantId: string, @Body() dto: CreateOemDto) {
    return this.oemsService.create(tenantId, dto);
  }

  @Get(':oemId')
  get(@TenantId() tenantId: string, @Param('oemId') oemId: string) {
    return this.oemsService.get(tenantId, oemId);
  }

  @Patch(':oemId')
  update(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Body() dto: UpdateOemDto,
  ) {
    return this.oemsService.update(tenantId, oemId, dto);
  }

  @Post(':oemId/status')
  setStatus(
    @TenantId() tenantId: string,
    @Param('oemId') oemId: string,
    @Body() dto: SetOemStatusDto,
  ) {
    return this.oemsService.setStatus(tenantId, oemId, dto.status);
  }
}
