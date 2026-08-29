import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as internal-only, accessible by service-to-service calls
 * authenticated with a shared API key. Until E02 ships the real guard,
 * this is a no-op metadata decorator.
 */
export const INTERNAL_ONLY_KEY = 'internalOnly';
export const InternalOnly = (scope: string) =>
  SetMetadata(INTERNAL_ONLY_KEY, { scope });
