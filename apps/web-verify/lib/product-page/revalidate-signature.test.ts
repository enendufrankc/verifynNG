import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRevalidateSignature } from './revalidate-signature';

const SECRET = 'test-secret';

function sign(
  tenantSlug: string,
  productSlug: string,
  ts: number,
  secret = SECRET,
) {
  return createHmac('sha256', secret)
    .update(`${tenantSlug}.${productSlug}.${ts}`)
    .digest('hex');
}

describe('verifyRevalidateSignature', () => {
  it('accepts a freshly signed payload', () => {
    const ts = Date.now();
    const sig = sign('ivoryglow', 'turmeric-curcumin', ts);
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'ivoryglow', productSlug: 'turmeric-curcumin', ts, sig },
        SECRET,
      ),
    ).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    const ts = Date.now();
    const sig = sign('ivoryglow', 'turmeric-curcumin', ts, 'other-secret');
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'ivoryglow', productSlug: 'turmeric-curcumin', ts, sig },
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a signature for a different slug pair (no cross-page replay)', () => {
    const ts = Date.now();
    const sig = sign('ivoryglow', 'turmeric-curcumin', ts);
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'ivoryglow', productSlug: 'vitamin-c', ts, sig },
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a stale timestamp outside the replay window', () => {
    const ts = Date.now() - 120_000;
    const sig = sign('ivoryglow', 'turmeric-curcumin', ts);
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'ivoryglow', productSlug: 'turmeric-curcumin', ts, sig },
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a future timestamp outside the replay window', () => {
    const ts = Date.now() + 120_000;
    const sig = sign('ivoryglow', 'turmeric-curcumin', ts);
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'ivoryglow', productSlug: 'turmeric-curcumin', ts, sig },
        SECRET,
      ),
    ).toBe(false);
  });

  it('rejects a non-finite timestamp', () => {
    expect(
      verifyRevalidateSignature(
        { tenantSlug: 'a', productSlug: 'b', ts: NaN, sig: 'x' },
        SECRET,
      ),
    ).toBe(false);
  });
});
