import { ApiProperty } from '@nestjs/swagger';

export class BrandDto {
  @ApiProperty() slug!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ required: false }) logoUrl?: string;
}

export class ProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ required: false }) gtin?: string;
}

export class BatchDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false }) oem?: string;
  @ApiProperty() commissionedAt!: string;
}

export class HistoryDto {
  @ApiProperty() firstVerifiedAt!: string | null;
  @ApiProperty() scanCount!: number;
  @ApiProperty() distinctRegions!: string[];
  @ApiProperty() lastVerifiedAt!: string | null;
}

export class SignalsDto {
  @ApiProperty() first!: boolean;
  @ApiProperty() multiRegion!: boolean;
  @ApiProperty() highCount!: boolean;
  @ApiProperty() flagged!: boolean;
}

export class VerifyResponseDto {
  @ApiProperty({
    enum: [
      'invalid',
      'unknown',
      'ok',
      'authentic',
      'already-verified',
      'suspicious',
      'flagged',
      'decommissioned',
      'rate-limited',
    ],
  })
  verdict!: string;

  @ApiProperty({ enum: ['green', 'amber', 'red', 'grey'] })
  severity!: string;

  @ApiProperty({ required: false }) tier?: 1 | 2;

  @ApiProperty() code!: string;

  @ApiProperty({ required: false }) brand?: BrandDto;
  @ApiProperty({ required: false }) product?: ProductDto;
  @ApiProperty({ required: false }) batch?: BatchDto;

  @ApiProperty() message!: string;

  @ApiProperty({ required: false }) history?: HistoryDto;
  @ApiProperty({ required: false }) signals?: SignalsDto;

  @ApiProperty({ required: false }) retryAfterSec?: number;
  @ApiProperty() reportable!: boolean;

  @ApiProperty({ required: false }) scanEventId?: string;
}