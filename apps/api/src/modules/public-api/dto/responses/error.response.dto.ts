import { ApiProperty } from '@nestjs/swagger';

const ERROR_TYPES = [
  'not_found',
  'validation',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'conflict',
  'idempotency_mismatch',
  'plan_limit',
  'internal',
] as const;

class ErrorDetailDto {
  @ApiProperty({ required: false }) field?: string;
  @ApiProperty() issue!: string;
}

class ErrorBodyDto {
  @ApiProperty({ enum: ERROR_TYPES }) type!: (typeof ERROR_TYPES)[number];
  @ApiProperty() message!: string;
  @ApiProperty({ required: false }) requestId?: string;
  @ApiProperty() docs!: string;
  @ApiProperty({ type: [ErrorDetailDto], required: false })
  details?: ErrorDetailDto[];
}

/** Every non-2xx response on `/api/v1/**` — see ApiErrorFilter. */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
}
