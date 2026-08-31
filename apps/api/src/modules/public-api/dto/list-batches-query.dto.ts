import { IsIn, IsOptional, IsString } from 'class-validator';
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
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsIn(BATCH_STATUSES)
  status?: (typeof BATCH_STATUSES)[number];
}
