import { ApiProperty } from '@nestjs/swagger';

const BATCH_STATUSES = [
  'minting',
  'minted',
  'delivered',
  'printed',
  'shipped',
  'closed',
  'failed',
] as const;

export class BatchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty({ nullable: true, type: String }) oemId!: string | null;
  @ApiProperty() count!: number;
  @ApiProperty({ enum: BATCH_STATUSES })
  status!: (typeof BATCH_STATUSES)[number];
  @ApiProperty() mintedCount!: number;
  @ApiProperty() watermark!: string;
  @ApiProperty() kid!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expectedShipDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  mintedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  exportsReadyAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateBatchResponseDto {
  @ApiProperty({ type: BatchResponseDto }) batch!: BatchResponseDto;
  @ApiProperty({ nullable: true, type: String }) exportUrl!: string | null;
}

export class BatchesPageDto {
  @ApiProperty({ type: [BatchResponseDto] }) data!: BatchResponseDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
