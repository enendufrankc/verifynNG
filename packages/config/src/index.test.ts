import { describe, it, expect } from 'vitest';
import { envSchema, loadEnv } from './index';

describe('envSchema', () => {
  it('has defaults for all E00 variables', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('parses a valid env', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid NODE_ENV', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('loadEnv', () => {
  it('returns a typed env object', () => {
    const env = loadEnv();
    expect(env).toHaveProperty('NODE_ENV');
    expect(env).toHaveProperty('DATABASE_URL');
    expect(env).toHaveProperty('REDIS_URL');
    expect(env).toHaveProperty('API_PORT');
  });
});
