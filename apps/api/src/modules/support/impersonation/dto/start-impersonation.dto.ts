import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum ImpersonationModeDto {
  read = 'read',
  write = 'write',
}

export class StartImpersonationDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsEnum(ImpersonationModeDto)
  mode!: ImpersonationModeDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
