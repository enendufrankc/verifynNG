import { ApiProperty } from '@nestjs/swagger';

const SCAN_TIERS = ['tier1', 'tier2'] as const;
const SCAN_SOURCES = ['qr', 'manual', 'sms', 'api'] as const;

export class ScanEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ nullable: true, type: String }) unitId!: string | null;
  @ApiProperty({ nullable: true, type: String }) batchId!: string | null;
  @ApiProperty({ nullable: true, type: String }) productId!: string | null;
  @ApiProperty({ enum: SCAN_TIERS }) tier!: (typeof SCAN_TIERS)[number];
  @ApiProperty({
    description:
      'Free-text verdict, e.g. authentic | suspicious | flagged | unknown-tier2.',
  })
  verdict!: string;
  @ApiProperty({ enum: SCAN_SOURCES }) source!: (typeof SCAN_SOURCES)[number];
  @ApiProperty() codeRedacted!: string;
  @ApiProperty({ nullable: true, type: String }) geoCountry!: string | null;
  @ApiProperty({ nullable: true, type: String }) geoCity!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class ScanEventsPageDto {
  @ApiProperty({ type: [ScanEventResponseDto] }) data!: ScanEventResponseDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
