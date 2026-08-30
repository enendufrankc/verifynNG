import { describe, expect, it } from 'vitest';
import { brandingSchema } from './branding.schema';

describe('brandingSchema', () => {
  it('accepts supported branding values', () => {
    expect(
      brandingSchema.parse({
        displayName: 'Test Brand',
        primaryColor: '#123ABC',
        websiteUrl: 'https://example.com',
        logoUrl: 'tenants/tenant-1/branding/logo.png',
      }),
    ).toEqual({
      displayName: 'Test Brand',
      primaryColor: '#123ABC',
      websiteUrl: 'https://example.com',
      logoUrl: 'tenants/tenant-1/branding/logo.png',
    });
  });

  it('rejects unsafe URLs, colours, and logo locations', () => {
    expect(() =>
      brandingSchema.parse({
        primaryColor: 'red',
        websiteUrl: 'http://example.com',
        logoUrl: 'https://example.com/logo.png',
      }),
    ).toThrow();
  });
});
