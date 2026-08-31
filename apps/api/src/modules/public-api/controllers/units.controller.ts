import { Body, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { PublicApiController } from '../decorators/public-api-controller.decorator.js';
import { Scopes } from '../decorators/scopes.decorator.js';
import { ApiPublicCommonResponses } from '../decorators/api-common-responses.decorator.js';
import { toPublicUnit } from '../mappers/unit.mapper.js';
import { UnitResponseDto } from '../dto/responses/unit.response.dto.js';
import { ErrorResponseDto } from '../dto/responses/error.response.dto.js';
import { FlagReasonDto } from '../dto/flag-reason.doc.dto.js';
import { UnitLifecycleService } from '../../units/unit-lifecycle.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { FlagUnitDto } from '../../units/dto/flag-unit.dto.js';

const NOT_FOUND_RESPONSE = {
  status: 404,
  description: 'Not found, or belongs to another tenant — never 403.',
  type: ErrorResponseDto,
};

@ApiTags('units')
@ApiBearerAuth('apiKey')
@ApiPublicCommonResponses()
@PublicApiController('api/v1/units')
export class PublicUnitsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly lifecycle: UnitLifecycleService,
    private readonly auditService: AuditService,
  ) {}

  @Get(':id')
  @Scopes('read:units')
  @ApiOperation({ summary: 'Get a single unit (tier-2 code never returned)' })
  @ApiResponse({ status: 200, type: UnitResponseDto })
  @ApiResponse(NOT_FOUND_RESPONSE)
  async get(@Req() req: Request, @Param('id') id: string) {
    const tenantId = req.apiKey!.tenantId;
    const unit = await this.prisma.unit.findFirst({ where: { id, tenantId } });
    if (!unit) throw new NotFoundException();
    return toPublicUnit(unit);
  }

  @Post(':id/flag')
  @Scopes('write:units')
  @ApiOperation({ summary: 'Flag a unit as suspicious' })
  @ApiBody({ type: FlagReasonDto })
  @ApiResponse({ status: 201, type: UnitResponseDto })
  @ApiResponse(NOT_FOUND_RESPONSE)
  @ApiResponse({
    status: 409,
    description: 'Unit is not in a state this transition allows.',
    type: ErrorResponseDto,
  })
  async flag(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
  ) {
    return this.transition('flag', 'unit.flag', req, id, dto.reason);
  }

  @Post(':id/decommission')
  @Scopes('write:units')
  @ApiOperation({
    summary: 'Decommission a unit (confirmed counterfeit, recalled, etc.)',
  })
  @ApiBody({ type: FlagReasonDto })
  @ApiResponse({ status: 201, type: UnitResponseDto })
  @ApiResponse(NOT_FOUND_RESPONSE)
  @ApiResponse({
    status: 409,
    description: 'Unit is not in a state this transition allows.',
    type: ErrorResponseDto,
  })
  async decommission(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
  ) {
    return this.transition(
      'decommission',
      'unit.decommission',
      req,
      id,
      dto.reason,
    );
  }

  @Post(':id/restore')
  @Scopes('write:units')
  @ApiOperation({
    summary: 'Restore a flagged or decommissioned unit to active',
  })
  @ApiBody({ type: FlagReasonDto })
  @ApiResponse({ status: 201, type: UnitResponseDto })
  @ApiResponse(NOT_FOUND_RESPONSE)
  @ApiResponse({
    status: 409,
    description: 'Unit is not in a state this transition allows.',
    type: ErrorResponseDto,
  })
  async restore(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: FlagUnitDto,
  ) {
    return this.transition('restore', 'unit.restore', req, id, dto.reason);
  }

  private async transition(
    kind: 'flag' | 'decommission' | 'restore',
    auditAction: string,
    req: Request,
    unitId: string,
    reason: string,
  ) {
    const apiKey = req.apiKey!;
    const unit = await this.lifecycle[kind](apiKey.tenantId, unitId, {
      actor: { type: 'apikey', id: apiKey.keyId },
      reason,
    });

    await this.auditService.record({
      tenantId: apiKey.tenantId,
      actor: { type: 'apikey', id: apiKey.keyId },
      action: auditAction,
      target: { type: 'unit', id: unitId },
      payload: { reason },
    });

    return toPublicUnit(unit);
  }
}
