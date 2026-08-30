import { describe, expect, it } from 'vitest';
import { decideTenantStatus } from './tenant-status.guard';

describe('decideTenantStatus', () => {
  const statuses = [
    'pending',
    'in_review',
    'rejected',
    'active',
    'suspended',
    'restricted',
    'offboarded',
  ];
  const methods = ['GET', 'POST', 'PATCH', 'DELETE'];
  for (const status of statuses)
    for (const method of methods) {
      it(`${status} ${method} follows lifecycle policy`, () => {
        const result = decideTenantStatus(status, method, undefined, false);
        expect(result.allowed).toBe(
          status === 'active' || (method === 'GET' && status !== 'offboarded'),
        );
      });
    }
  it('explicit route statuses allow onboarding writes', () => {
    expect(decideTenantStatus('pending', 'POST', ['pending'], false)).toEqual({
      allowed: true,
    });
    expect(decideTenantStatus('rejected', 'POST', ['rejected'], false)).toEqual(
      { allowed: true },
    );
  });
  it('allow-when-suspended permits writes', () => {
    expect(decideTenantStatus('suspended', 'POST', undefined, true)).toEqual({
      allowed: true,
    });
    expect(decideTenantStatus('restricted', 'PATCH', undefined, true)).toEqual({
      allowed: true,
    });
  });
  it('only export GET is allowed after offboarding', () => {
    expect(decideTenantStatus('offboarded', 'GET', undefined, false)).toEqual({
      allowed: false,
      error: 'tenant_offboarded',
    });
    expect(
      decideTenantStatus('offboarded', 'GET', undefined, false, true),
    ).toEqual({ allowed: true });
  });
});
