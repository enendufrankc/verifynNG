export interface ApiErrorBody {
  type: string;
  message: string;
  requestId?: string;
  docs: string;
  details?: Array<{ field?: string; issue: string }>;
}

/** Thrown for any non-2xx `/api/v1` response — see ApiErrorFilter's envelope. */
export class VerifyNGApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(`${body.type} (${status}): ${body.message}`);
    this.name = 'VerifyNGApiError';
  }
}
