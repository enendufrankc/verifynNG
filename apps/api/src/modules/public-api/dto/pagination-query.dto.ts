import { IsNumberString, IsOptional, IsString } from 'class-validator';

/**
 * `limit` stays a string here and is parsed + clamped by `parseLimit()` in
 * the controller — matches the codebase's existing convention (see
 * BatchesController.getUnits) rather than relying on class-transformer's
 * `@Type(() => Number)`, which this app's ValidationPipe setup does not
 * apply to `@Query()` DTOs (query values arrive untransformed).
 */
export class PaginationQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
