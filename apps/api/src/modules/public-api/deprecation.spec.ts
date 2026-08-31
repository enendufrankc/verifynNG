import { describe, it, expect } from 'vitest';
import {
  buildDeprecationHeaders,
  lookupDeprecation,
  routeKeyFor,
  toHttpDate,
} from './deprecation.js';

describe('toHttpDate', () => {
  it('formats an ISO date as an RFC 7231 IMF-fixdate', () => {
    expect(toHttpDate('2027-09-01')).toBe('Wed, 01 Sep 2027 00:00:00 GMT');
  });
});

describe('routeKeyFor', () => {
  it('joins method + path, uppercasing the method', () => {
    expect(routeKeyFor('get', '/api/v1/me')).toBe('GET /api/v1/me');
  });
});

describe('lookupDeprecation', () => {
  const map = { 'GET /api/v1/me': { sunset: '2027-09-01' } };

  it('finds a matching entry', () => {
    expect(lookupDeprecation(map, 'GET', '/api/v1/me')).toEqual({
      sunset: '2027-09-01',
    });
  });

  it('returns undefined for a non-deprecated route', () => {
    expect(lookupDeprecation(map, 'GET', '/api/v1/batches')).toBeUndefined();
  });

  it('returns undefined when routePath is unset (no matched route)', () => {
    expect(lookupDeprecation(map, 'GET', undefined)).toBeUndefined();
  });
});

describe('buildDeprecationHeaders', () => {
  it('builds Deprecation/Sunset/Link per docs/public-api-deprecation-policy.md', () => {
    const headers = buildDeprecationHeaders(
      { sunset: '2027-09-01' },
      'http://localhost:4000/api/docs#deprecation-policy',
    );
    expect(headers).toEqual({
      Deprecation: 'true',
      Sunset: 'Wed, 01 Sep 2027 00:00:00 GMT',
      Link: '<http://localhost:4000/api/docs#deprecation-policy>; rel="deprecation"',
    });
  });
});
