import { describe, expect, it, vi } from 'vitest';
import { BrandingResolver } from './branding-resolver';

describe('BrandingResolver', () => {
  const config = {
    get: vi.fn((key: string) =>
      key === 'NOTIFICATIONS_FROM'
        ? 'Platform <platform@example.test>'
        : undefined,
    ),
  } as never;

  it('uses tenant name and the platform sender by default', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ name: 'IVORY GLOW' }) },
      tenantSenderIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never;
    const result = await new BrandingResolver(prisma, config).for('tenant-1');

    expect(result.tenantName).toBe('IVORY GLOW');
    expect(result.sender).toEqual({
      fromName: 'Platform',
      fromAddress: 'platform@example.test',
    });
  });

  it('uses a verified tenant sender identity override', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue({ name: 'IVORY GLOW' }) },
      tenantSenderIdentity: {
        findUnique: vi.fn().mockResolvedValue({
          fromName: 'IVORY GLOW',
          fromAddress: 'hello@ivoryglow.test',
          replyTo: 'support@ivoryglow.test',
          verificationStatus: 'verified',
        }),
      },
    } as never;
    const result = await new BrandingResolver(prisma, config).for('tenant-1');

    expect(result.sender).toEqual({
      fromName: 'IVORY GLOW',
      fromAddress: 'hello@ivoryglow.test',
      replyTo: 'support@ivoryglow.test',
    });
  });

  it('ignores unverified tenant identities', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      tenantSenderIdentity: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ verificationStatus: 'pending' }),
      },
    } as never;
    const result = await new BrandingResolver(prisma, config).for('tenant-1');

    expect(result.sender.fromAddress).toBe('platform@example.test');
  });
});
