import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { PrismaClient, UnitState } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantId } from '../auth/decorators/tenant-id.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Principal } from '../auth/decorators/principal.decorator';
import { isApiClientPrincipal } from '../auth/types/principal';
import type { Principal as PrincipalType } from '../auth/types/principal';
import { Audited } from '../audit/audited.decorator.js';
import type { AuthenticatedRequest } from '../../common/authenticated-request.js';
import { UnitLifecycleService } from './unit-lifecycle.service';
import { RecallBatchDto } from './dto/recall-batch.dto';

function userIdOf(principal: PrincipalType | undefined): string | undefined {
  return principal && !isApiClientPrincipal(principal)
    ? principal.userId
    : undefined;
}

@Controller('v1/batches')
export class BatchesUnitsController {
  constructor(
    private readonly lifecycle: UnitLifecycleService,
    private readonly prisma: PrismaClient,
    @InjectQueue('units') private readonly unitsQueue: Queue,
  ) {}

  @Get(':batchId/units')
  @Roles('viewer')
  async getUnits(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Query('state') state?: UnitState,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(limit ? parseInt(limit, 10) : 100, 500);
    const items = await this.prisma.unit.findMany({
      where: { tenantId, batchId, ...(state ? { state } : {}) },
      orderBy: { serial: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    let nextCursor: string | undefined;
    if (items.length > take) {
      nextCursor = items.pop()!.id;
    }
    return { items, cursor: nextCursor };
  }

  @Post(':batchId/recall')
  @Roles('owner')
  @Audited('batch.recall', {
    target: (req: AuthenticatedRequest) => ({
      type: 'batch',
      id: (req.params?.batchId as string) ?? 'unknown',
    }),
  })
  recall(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Body() dto: RecallBatchDto,
    @Principal() principal?: PrincipalType,
  ) {
    return this.lifecycle.recallBatch(tenantId, batchId, {
      actor: { type: 'user', id: userIdOf(principal) },
      reason: dto.reason,
    });
  }

  @Get(':batchId/recall/:jobId')
  @Roles('viewer')
  async recallProgress(
    @TenantId() tenantId: string,
    @Param('batchId') batchId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.unitsQueue.getJob(jobId);
    if (
      !job ||
      job.data?.tenantId !== tenantId ||
      job.data?.batchId !== batchId
    ) {
      throw new NotFoundException();
    }
    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
    };
  }
}
