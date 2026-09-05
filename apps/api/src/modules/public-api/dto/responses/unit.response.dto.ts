import { ApiProperty } from '@nestjs/swagger';

const UNIT_STATES = ['active', 'flagged', 'decommissioned'] as const;

export class UnitResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() batchId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() tier1Code!: string;
  @ApiProperty({
    description: 'First 8 hex chars of the tier-2 hash — never the full value.',
  })
  tier2HashRedacted!: string;
  @ApiProperty({ enum: UNIT_STATES }) state!: (typeof UNIT_STATES)[number];
  @ApiProperty() serial!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class UnitsPageDto {
  @ApiProperty({ type: [UnitResponseDto] }) data!: UnitResponseDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
}
