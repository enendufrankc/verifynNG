import { IsString } from 'class-validator';

export class MfaDisableDto {
  @IsString()
  password!: string;

  @IsString()
  code!: string;
}
