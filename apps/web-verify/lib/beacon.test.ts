import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPageBeacon } from './beacon';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_API_URL;

describe('sendPageBeacon', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:4000';
    vi.stubGlobal('navigator', {
      sendBeacon: vi.fn(),
      doNotTrack: '0',
    });
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it('posts to /v1/events/page on the browser-facing API origin', () => {
    sendPageBeacon({
      tenantSlug: 'ivoryglow',
      route: '/v/[code]',
      verdict: 'authentic',
      tier: 2,
      locale: 'en',
      referrerType: 'qr',
    });
    expect(navigator.sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, Blob];
    expect(url).toBe('http://localhost:4000/v1/events/page');
    expect(body).toBeInstanceOf(Blob);
  });

  it('never includes an identifier field (no cookie, no IP, no user id)', () => {
    const stringifySpy = vi.spyOn(JSON, 'stringify');
    sendPageBeacon({
      tenantSlug: 'ivoryglow',
      route: '/v/[code]',
      locale: 'en',
      referrerType: 'manual',
    });
    const payload = stringifySpy.mock.results[0]?.value as string;
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect([
        'tenantSlug',
        'route',
        'verdict',
        'tier',
        'locale',
        'referrerType',
      ]).toContain(key);
    }
    stringifySpy.mockRestore();
  });

  it('honours navigator.doNotTrack', () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(), doNotTrack: '1' });
    sendPageBeacon({
      tenantSlug: 'ivoryglow',
      route: '/verify',
      locale: 'en',
      referrerType: 'direct',
    });
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });

  it('no-ops when NEXT_PUBLIC_API_URL is unset', () => {
    process.env.NEXT_PUBLIC_API_URL = '';
    sendPageBeacon({
      tenantSlug: 'ivoryglow',
      route: '/verify',
      locale: 'en',
      referrerType: 'direct',
    });
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
  });
});
