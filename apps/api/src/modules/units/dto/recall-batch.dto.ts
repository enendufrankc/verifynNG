import { IsNotEmpty, IsString } from 'class-validator';

export class RecallBatchDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
