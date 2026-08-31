import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from './pagination-query.dto.js';

const BATCH_STATUSES = [
  'minting',
  'minted',
  'delivered',
  'printed',
  'shipped',
  'closed',
  'failed',
] as const;

export class ListBatchesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ enum: BATCH_STATUSES })
  @IsOptional()
  @IsIn(BATCH_STATUSES)
  status?: (typeof BATCH_STATUSES)[number];
}
