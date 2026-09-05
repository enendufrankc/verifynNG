import { ApiProperty } from '@nestjs/swagger';

const PURCHASE_CHANNELS = [
  'open_market',
  'street_vendor',
  'online_marketplace',
  'social_media',
  'pharmacy',
  'supermarket',
  'brand_store',
  'other',
] as const;
const REPORT_STATUSES = ['new', 'triaged', 'investigating', 'closed'] as const;
const REPORT_OUTCOMES = [
  'confirmed_counterfeit',
  'legit',
  'insufficient',
] as const;

export class ReportResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ nullable: true, type: String }) scanEventId!: string | null;
  @ApiProperty({ nullable: true, type: String }) unitId!: string | null;
  @ApiProperty({ nullable: true, type: String }) batchId!: string | null;
  @ApiProperty({ nullable: true, type: String }) productId!: string | null;
  @ApiProperty() verdictAtReport!: string;
  @ApiProperty({ nullable: true, type: String }) sellerName!: string | null;
  @ApiProperty({ nullable: true, type: String }) sellerLocation!: string | null;
  @ApiProperty({ enum: PURCHASE_CHANNELS })
  purchaseChannel!: (typeof PURCHASE_CHANNELS)[number];
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  purchaseDate!: string | null;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: REPORT_STATUSES })
  status!: (typeof REPORT_STATUSES)[number];
  @ApiProperty({ enum: REPORT_OUTCOMES, nullable: true })
  outcome!: (typeof REPORT_OUTCOMES)[number] | null;
  @ApiProperty({ nullable: true, type: String }) assignedToId!: string | null;
  @ApiProperty({ nullable: true, type: String }) locale!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  closedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ReportsPageDto {
  @ApiProperty({ type: [ReportResponseDto] }) data!: ReportResponseDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
