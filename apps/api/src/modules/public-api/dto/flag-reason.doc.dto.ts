import { ApiProperty } from '@nestjs/swagger';

/**
 * Documentation-only mirror of E04's FlagUnitDto (apps/api/src/modules/units/dto/flag-unit.dto.ts)
 * — used solely via @ApiBody() so the OpenAPI schema doesn't require adding
 * @ApiProperty() to a file outside this epic's owned paths. Runtime
 * validation still uses the real FlagUnitDto.
 */
export class FlagReasonDto {
  @ApiProperty({ description: 'Why this action is being taken.' })
  reason!: string;
}
