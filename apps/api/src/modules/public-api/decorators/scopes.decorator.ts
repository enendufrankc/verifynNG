import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '../../api-keys/scopes.js';

export const SCOPES_KEY = 'publicApiScopes';

/** Requires the caller's API key to carry every listed scope. Omit for "any scope" routes. */
export const Scopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
