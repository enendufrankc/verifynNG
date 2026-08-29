import { IsString, IsOptional } from 'class-validator';

export class MfaChallengeDto {
  @IsString()
  mfaToken!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}
