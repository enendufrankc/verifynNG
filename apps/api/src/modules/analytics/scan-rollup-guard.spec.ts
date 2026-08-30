import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Rollups only in the UI" is enforced here, not by code-review note: nothing
 * under this module's read path (or the metering module, which also exposes
 * a read API) may touch `prisma.scanEvent` — only jobs/ may, since jobs/ is
 * where the rollups get computed from raw ScanEvent in the first place.
 */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'jobs') continue; // the ONE place allowed to read ScanEvent
      out.push(...listFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('analytics/metering read paths never query ScanEvent directly', () => {
  it('apps/api/src/modules/analytics (excluding jobs/) has no scanEvent reference', () => {
    const analyticsDir = join(__dirname);
    const offenders = listFiles(analyticsDir).filter((f) =>
      /\.scanEvent\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('apps/api/src/modules/metering has no scanEvent reference', () => {
    const meteringDir = join(__dirname, '..', 'metering');
    const offenders = listFiles(meteringDir).filter((f) =>
      /\.scanEvent\b/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
