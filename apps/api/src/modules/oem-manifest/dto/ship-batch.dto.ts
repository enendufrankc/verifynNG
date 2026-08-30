import { IsISO8601, IsObject, IsOptional, IsString } from 'class-validator';

export class ShipBatchDto {
  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingRef?: string;

  @IsOptional()
  @IsISO8601()
  shippedAt?: string;

  @IsOptional()
  @IsISO8601()
  expectedArrivalAt?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
