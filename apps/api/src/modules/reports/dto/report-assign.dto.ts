import { IsNotEmpty, IsString } from 'class-validator';

export class ReportAssignDto {
  @IsString()
  @IsNotEmpty()
  memberId!: string;
}
