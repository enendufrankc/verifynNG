import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as public (no auth required).
 * Until E02 ships the real guard, this is a no-op metadata decorator.
 * When E02's AuthGuard is added, it will check for this metadata.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
