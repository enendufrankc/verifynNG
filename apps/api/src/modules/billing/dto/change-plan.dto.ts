import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChangePlanDto {
  @IsString()
  @IsNotEmpty()
  planCode!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
