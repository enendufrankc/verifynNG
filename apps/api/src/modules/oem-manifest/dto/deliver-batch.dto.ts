import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class DeliverBatchDto {
  @IsString()
  oemId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  expiresInHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxDownloads?: number;

  @IsOptional()
  @IsISO8601()
  expectedShipDate?: string;
}
