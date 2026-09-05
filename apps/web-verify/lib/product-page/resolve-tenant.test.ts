import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

function mockEnv(overrides: Record<string, unknown> = {}) {
  vi.doMock('@verifynng/config', () => ({
    loadEnv: () => ({
      PLATFORM_HOSTS: 'localhost:3000',
      PAGE_DOMAIN_STUB: 'ivoryglow.localhost:3000:ivoryglow',
      ...overrides,
    }),
  }));
}

function req(pathname: string, host: string): NextRequest {
  return new NextRequest(new URL(pathname, 'http://placeholder.local'), {
    headers: { host },
  });
}

describe('resolveTenantByHost', () => {
  it('returns null for a platform host (path-based routing)', async () => {
    vi.resetModules();
    mockEnv();
    const { resolveTenantByHost } = await import('./resolve-tenant');
    expect(resolveTenantByHost('localhost:3000')).toBeNull();
  });

  it('resolves a stubbed custom domain to its tenant slug', async () => {
    vi.resetModules();
    mockEnv();
    const { resolveTenantByHost } = await import('./resolve-tenant');
    expect(resolveTenantByHost('ivoryglow.localhost:3000')).toBe('ivoryglow');
  });

  it('returns null for an unrecognised host (E03 lookup stubs to "not found")', async () => {
    vi.resetModules();
    mockEnv();
    const { resolveTenantByHost } = await import('./resolve-tenant');
    expect(resolveTenantByHost('unknown.example.com')).toBeNull();
  });

  it('returns null when no stub is configured', async () => {
    vi.resetModules();
    mockEnv({ PAGE_DOMAIN_STUB: '' });
    const { resolveTenantByHost } = await import('./resolve-tenant');
    expect(resolveTenantByHost('ivoryglow.localhost:3000')).toBeNull();
  });
});

describe('productPageRewrite', () => {
  it('rewrites a single-segment path on a resolved custom domain', async () => {
    vi.resetModules();
    mockEnv();
    const { productPageRewrite } = await import('./resolve-tenant');
    const res = productPageRewrite(
      req('/turmeric-curcumin', 'ivoryglow.localhost:3000'),
    );
    expect(res).not.toBeNull();
    expect(res!.headers.get('x-middleware-rewrite')).toContain(
      '/p/ivoryglow/turmeric-curcumin',
    );
  });

  it('does not rewrite on a platform host', async () => {
    vi.resetModules();
    mockEnv();
    const { productPageRewrite } = await import('./resolve-tenant');
    const res = productPageRewrite(req('/turmeric-curcumin', 'localhost:3000'));
    expect(res).toBeNull();
  });

  it('does not rewrite reserved top-level paths even on a resolved domain', async () => {
    vi.resetModules();
    mockEnv();
    const { productPageRewrite } = await import('./resolve-tenant');
    for (const path of ['/p', '/v', '/verify', '/status', '/legal', '/api']) {
      const res = productPageRewrite(req(path, 'ivoryglow.localhost:3000'));
      expect(res).toBeNull();
    }
  });

  it('does not rewrite multi-segment paths', async () => {
    vi.resetModules();
    mockEnv();
    const { productPageRewrite } = await import('./resolve-tenant');
    const res = productPageRewrite(
      req('/turmeric-curcumin/extra', 'ivoryglow.localhost:3000'),
    );
    expect(res).toBeNull();
  });

  it('returns null when the request has no Host header', async () => {
    vi.resetModules();
    mockEnv();
    const { productPageRewrite } = await import('./resolve-tenant');
    const bare = new NextRequest(
      new URL('/turmeric-curcumin', 'http://placeholder.local'),
    );
    bare.headers.delete('host');
    expect(productPageRewrite(bare)).toBeNull();
  });
});
