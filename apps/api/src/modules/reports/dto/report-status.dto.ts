import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReportStatus, ReportOutcome } from '@prisma/client';

export class ReportStatusChangeDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;

  @IsOptional()
  @IsEnum(ReportOutcome)
  outcome?: ReportOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  notifyConsumer?: boolean;
}
