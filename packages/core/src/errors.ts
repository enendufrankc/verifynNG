/**
 * Typed error classes for the code engine.
 */

export class InvalidCodeError extends Error {
  public readonly code = 'INVALID_CODE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidCodeError';
  }
}

export class UnknownKeyError extends Error {
  public readonly code = 'UNKNOWN_KEY' as const;
  public readonly kid: string;

  constructor(kid: string) {
    super(`Unknown key id: ${kid}`);
    this.name = 'UnknownKeyError';
    this.kid = kid;
  }
}
