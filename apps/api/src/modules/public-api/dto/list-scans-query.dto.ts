import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from './pagination-query.dto.js';

export class ListScansQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({
    example: 'suspicious',
    description: 'authentic | suspicious | flagged | unknown-tier2',
  })
  @IsOptional()
  @IsString()
  verdict?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
