import { describe, expect, it } from 'vitest';
import { exportRows } from './tenant-export.data';

describe('tenant export rows', () => {
  it('exports unit hashes without raw tier-1 or tier-2 codes', () => {
    const rows = exportRows('units', [
      {
        id: 'unit-1',
        tenantId: 'tenant-1',
        batchId: 'batch-1',
        tier1Code: 'RAW-TIER-1',
        tier2Hash: 'HASH-TIER-2',
        state: 'active',
      },
    ]);

    expect(rows).toEqual([
      {
        id: 'unit-1',
        tenantId: 'tenant-1',
        batchId: 'batch-1',
        tier2Hash: 'HASH-TIER-2',
        state: 'active',
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('RAW-TIER-1');
  });
});
