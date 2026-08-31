import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/responses/error.response.dto.js';

/** Error responses every `/api/v1` route can produce — applied once per controller. */
export function ApiPublicCommonResponses() {
  return applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ApiResponse({
      status: 401,
      description: 'Missing, malformed, revoked, or expired API key.',
      type: ErrorResponseDto,
    }),
    ApiResponse({
      status: 403,
      description: "The key's scopes don't cover this route.",
      type: ErrorResponseDto,
    }),
    ApiResponse({
      status: 429,
      description: 'Per-key rate limit exceeded.',
      type: ErrorResponseDto,
    }),
  );
}
