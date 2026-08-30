import { SetMetadata } from '@nestjs/common';

export const INTERNAL_ONLY_KEY = 'internalOnly';
export const InternalOnly = (scope?: string) =>
  SetMetadata(INTERNAL_ONLY_KEY, scope ?? true);
