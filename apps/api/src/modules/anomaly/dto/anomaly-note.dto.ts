import { IsOptional, IsString } from 'class-validator';

export class AnomalyNoteDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class AssignAnomalyDto {
  @IsString()
  userId!: string;
}
