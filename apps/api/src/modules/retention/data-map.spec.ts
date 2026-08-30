import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RetentionRunnerService } from './retention-runner.service';

// Any repo-root-relative path works since vitest runs from apps/api.
const DATA_MAP_PATH = join(
  __dirname,
  '../../../../../docs/compliance/data-map.md',
);

describe('docs/compliance/data-map.md', () => {
  it('every `retention:<policy>` reference names a policy that actually exists', () => {
    const doc = readFileSync(DATA_MAP_PATH, 'utf-8');
    const matches = [
      ...doc.matchAll(/`retention:([a-zA-Z][a-zA-Z0-9.]*)`/g),
    ].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);

    const registered = new Set(
      new RetentionRunnerService(
        { emit: async () => undefined } as never,
        { runDelete: async () => undefined } as never,
        { delete: async () => undefined } as never,
      )
        .listPolicies()
        .map((p) => p.name),
    );
    registered.add('none');

    const unknown = matches.filter((name) => !registered.has(name));
    expect(unknown).toEqual([]);
  });
});
