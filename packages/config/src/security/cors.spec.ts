import { describe, it, expect } from 'vitest';
import { corsAllowlist } from './cors.js';

describe('corsAllowlist', () => {
  it('returns admin origins for admin app', () => {
    const result = corsAllowlist('admin', {
      CORS_ORIGINS_ADMIN: 'http://localhost:3001, http://admin.example.com',
    });
    expect(result.origin).toEqual([
      'http://localhost:3001',
      'http://admin.example.com',
    ]);
  });

  it('returns verify origins for verify app', () => {
    const result = corsAllowlist('verify', {
      CORS_ORIGINS_VERIFY: 'http://localhost:3000',
    });
    expect(result.origin).toEqual(['http://localhost:3000']);
  });

  it('returns union of both for api app', () => {
    const result = corsAllowlist('api', {
      CORS_ORIGINS_ADMIN: 'http://localhost:3001',
      CORS_ORIGINS_VERIFY: 'http://localhost:3000',
    });
    expect(result.origin).toEqual([
      'http://localhost:3001',
      'http://localhost:3000',
    ]);
  });

  it('deduplicates origins for api app', () => {
    const result = corsAllowlist('api', {
      CORS_ORIGINS_ADMIN: 'http://localhost:3001',
      CORS_ORIGINS_VERIFY: 'http://localhost:3001',
    });
    expect(result.origin).toEqual(['http://localhost:3001']);
  });

  it('returns false when no origins configured', () => {
    const result = corsAllowlist('admin', {});
    expect(result.origin).toBe(false);
  });

  it('includes default methods and headers', () => {
    const result = corsAllowlist('api', {
      CORS_ORIGINS_ADMIN: 'http://localhost:3001',
    });
    expect(result.methods).toContain('GET');
    expect(result.methods).toContain('POST');
    expect(result.allowedHeaders).toContain('Authorization');
    expect(result.credentials).toBe(true);
  });
});
