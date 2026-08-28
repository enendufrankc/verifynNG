export { envSchema, type Env } from './env-schema.js';

import { envSchema, type Env } from './env-schema.js';

let _env: Env | undefined;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([key, vals]) => `${key}: ${vals?.join(', ')}`)
      .join('\n  ');
    throw new Error(`Environment validation failed:\n  ${message}`);
  }
  _env = result.data;
  return _env;
}
