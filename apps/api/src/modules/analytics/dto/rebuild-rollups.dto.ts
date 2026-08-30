import { IsISO8601, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class RebuildRollupsDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
