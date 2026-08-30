import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';

export class RulePatchDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  thresholds?: Record<string, number>;
}

export class UpdateRulesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RulePatchDto)
  geo_dispersion?: RulePatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RulePatchDto)
  velocity?: RulePatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RulePatchDto)
  dead_code?: RulePatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RulePatchDto)
  pre_reveal?: RulePatchDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RulePatchDto)
  duplicate_first?: RulePatchDto;
}
