import { IsNotEmpty, IsString } from 'class-validator';

export class FlagUnitDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
