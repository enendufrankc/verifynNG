import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from './pagination-query.dto.js';

const UNIT_STATES = ['active', 'flagged', 'decommissioned'] as const;

export class ListBatchUnitsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UNIT_STATES })
  @IsOptional()
  @IsIn(UNIT_STATES)
  state?: (typeof UNIT_STATES)[number];
}
