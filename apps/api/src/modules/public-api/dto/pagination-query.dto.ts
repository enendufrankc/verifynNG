import { IsNumberString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `limit` stays a string here and is parsed + clamped by `parseLimit()` in
 * the controller — matches the codebase's existing convention (see
 * BatchesController.getUnits) rather than relying on class-transformer's
 * `@Type(() => Number)`, which this app's ValidationPipe setup does not
 * apply to `@Query()` DTOs (query values arrive untransformed).
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
