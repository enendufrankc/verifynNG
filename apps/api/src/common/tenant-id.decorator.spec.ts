import { describe, it, expect } from 'vitest';
import { TenantId } from './tenant-id.decorator';

describe('TenantId decorator', () => {
  it('is defined', () => {
    expect(TenantId).toBeDefined();
  });
});
