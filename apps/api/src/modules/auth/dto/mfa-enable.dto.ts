import { IsString } from 'class-validator';

export class MfaEnableDto {
  @IsString()
  code!: string;
}
