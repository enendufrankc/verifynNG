import { Get, NotFoundException, Param, Req } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { toPublicUnit } from '../mappers/unit.mapper.js';

@PublicApiController('api/v1/units')
export class PublicUnitsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get(':id')
  @Scopes('read:units')
  async get(@Req() req: Request, @Param('id') id: string) {
    const tenantId = req.apiKey!.tenantId;
    const unit = await this.prisma.unit.findFirst({ where: { id, tenantId } });
    if (!unit) throw new NotFoundException();
    return toPublicUnit(unit);
  }
}
