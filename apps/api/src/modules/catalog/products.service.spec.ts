import { describe, it, expect, vi } from 'vitest';
import { validateGtin, ProductsService } from './products.service';

describe('validateGtin', () => {
  it('accepts valid GTIN-8', () => expect(validateGtin('96385074')).toBe(true));
  it('accepts valid GTIN-12', () =>
    expect(validateGtin('012345678905')).toBe(true));
  it('accepts valid GTIN-13 with check digit 2', () =>
    expect(validateGtin('0123456789012')).toBe(true));
  it('accepts valid GTIN-14', () =>
    expect(validateGtin('01234567890128')).toBe(true));
  it('rejects bad check digit GTIN-14', () =>
    expect(validateGtin('01234567890123')).toBe(false));
  it('rejects wrong-length', () => expect(validateGtin('12345')).toBe(false));
  it('rejects non-numeric', () =>
    expect(validateGtin('abcdefghijklmn')).toBe(false));
  it('rejects empty', () => expect(validateGtin('')).toBe(false));
  it('rejects GTIN with leading/trailing whitespace', () =>
    expect(validateGtin(' 01234567890128 ')).toBe(false));
  it('rejects GTIN-13 with bad check digit', () =>
    expect(validateGtin('0123456789013')).toBe(false));
});

describe('ProductsService events', () => {
  it('emits product.created after creating a product', async () => {
    const product = { id: 'p1', tenantId: 't1', sku: 'SKU1' };
    const prisma = { product: { create: async () => product } } as never;
    const events = { emit: vi.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(prisma, events as never);

    await service.create('t1', { sku: 'SKU1', name: 'Product' });

    expect(events.emit).toHaveBeenCalledWith(
      'product.created',
      expect.objectContaining({ tenantId: 't1', productId: 'p1', sku: 'SKU1' }),
    );
  });
});
