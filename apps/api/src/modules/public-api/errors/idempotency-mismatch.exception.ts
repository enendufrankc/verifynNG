import { ConflictException } from '@nestjs/common';

/** Same Idempotency-Key replayed with a different request body (T3). */
export class IdempotencyMismatchException extends ConflictException {
  constructor(message = 'Idempotency-Key was reused with a different body') {
    super(message);
  }
}
