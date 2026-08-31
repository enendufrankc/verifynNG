import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto.js';

const REPORT_STATUSES = ['new', 'triaged', 'investigating', 'closed'] as const;

export class ListReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];
}
