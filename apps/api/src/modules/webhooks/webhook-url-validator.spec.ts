import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

const loadEnvMock = vi.fn();
vi.mock('@verifynng/config', () => ({
  loadEnv: () => loadEnvMock(),
}));

// vi.mock calls above are hoisted above this import by vitest's transform.
import { WebhookUrlValidator } from './webhook-url-validator.js';

function setEnv(overrides: {
  WEBHOOKS_ALLOW_HTTP?: boolean;
  WEBHOOKS_ALLOW_PRIVATE?: boolean;
}) {
  loadEnvMock.mockReturnValue({
    WEBHOOKS_ALLOW_HTTP: false,
    WEBHOOKS_ALLOW_PRIVATE: false,
    ...overrides,
  });
}

describe('WebhookUrlValidator', () => {
  const validator = new WebhookUrlValidator();

  beforeEach(() => {
    lookupMock.mockReset();
    setEnv({});
  });

  it('rejects a malformed URL', async () => {
    await expect(validator.assertSafe('not a url')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects http when WEBHOOKS_ALLOW_HTTP is false', async () => {
    await expect(
      validator.assertSafe('http://example.com/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts http when WEBHOOKS_ALLOW_HTTP is true', async () => {
    setEnv({ WEBHOOKS_ALLOW_HTTP: true });
    lookupMock.mockResolvedValue([{ address: '203.0.113.5', family: 4 }]);
    await expect(
      validator.assertSafe('http://example.com/hook'),
    ).resolves.toBeUndefined();
  });

  it('rejects a hostname resolving to a private IPv4 range', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(
      validator.assertSafe('https://internal.example.com/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a hostname resolving to loopback', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(
      validator.assertSafe('https://localhost/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a hostname resolving to link-local', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.1.1', family: 4 }]);
    await expect(
      validator.assertSafe('https://metadata.example.com/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects IPv6 loopback and unique-local', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '::1', family: 6 }]);
    await expect(
      validator.assertSafe('https://v6.example.com/hook'),
    ).rejects.toMatchObject({ status: 400 });

    lookupMock.mockResolvedValueOnce([
      { address: 'fd12:3456:789a::1', family: 6 },
    ]);
    await expect(
      validator.assertSafe('https://v6.example.com/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a hostname resolving to a public address', async () => {
    lookupMock.mockResolvedValue([{ address: '203.0.113.5', family: 4 }]);
    await expect(
      validator.assertSafe('https://hooks.example.com/hook'),
    ).resolves.toBeUndefined();
  });

  it('rejects a hostname that fails to resolve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(
      validator.assertSafe('https://does-not-exist.invalid/hook'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('skips resolution entirely when WEBHOOKS_ALLOW_PRIVATE is true (compose)', async () => {
    setEnv({ WEBHOOKS_ALLOW_PRIVATE: true });
    await expect(
      validator.assertSafe('https://webhook-sink/hook/erp'),
    ).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });
});
