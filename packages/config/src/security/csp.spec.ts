import { describe, it, expect } from 'vitest';
import { buildCsp } from './csp.js';

describe('buildCsp', () => {
  it('includes nonce in script-src', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
    });
    expect(result['Content-Security-Policy']).toContain(
      "script-src 'nonce-abc123' 'strict-dynamic'",
    );
  });

  it('includes frame-ancestors none', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
    });
    expect(result['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'",
    );
  });

  it('includes object-src none', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
    });
    expect(result['Content-Security-Policy']).toContain("object-src 'none'");
  });

  it('includes api origin in connect-src', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
    });
    expect(result['Content-Security-Policy']).toContain(
      "connect-src 'self' http://localhost:4000",
    );
  });

  it('includes extra connect origins', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
      extraConnect: ['ws://localhost:4000'],
    });
    expect(result['Content-Security-Policy']).toContain('ws://localhost:4000');
  });

  it('uses Report-Only header when reportOnly is true', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
      reportOnly: true,
    });
    expect(result).toHaveProperty('Content-Security-Policy-Report-Only');
    expect(result).not.toHaveProperty('Content-Security-Policy');
  });

  it('uses enforcing header when reportOnly is false', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
      reportOnly: false,
    });
    expect(result).toHaveProperty('Content-Security-Policy');
    expect(result).not.toHaveProperty('Content-Security-Policy-Report-Only');
  });

  it('omits default-src and img-src by default (no behaviour change for existing callers)', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
    });
    expect(result['Content-Security-Policy']).not.toContain('default-src');
    expect(result['Content-Security-Policy']).not.toContain('img-src');
  });

  it('includes default-src and img-src when passed', () => {
    const result = buildCsp({
      nonce: 'abc123',
      apiOrigin: 'http://localhost:4000',
      defaultSrc: ["'self'"],
      imgSrc: ['http://localhost:9000'],
    });
    expect(result['Content-Security-Policy']).toContain("default-src 'self'");
    expect(result['Content-Security-Policy']).toContain(
      "img-src 'self' data: http://localhost:9000",
    );
  });
});
