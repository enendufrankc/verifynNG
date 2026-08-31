import { describe, expect, it } from 'vitest';
import blockFixtures from '../fixtures/blocks.sample.json';
import pageFixture from '../fixtures/page.sample.json';
import { BLOCK_TYPES, blockSchemas } from './blocks';
import { pageSchema } from './page';

describe('fixtures/blocks.sample.json', () => {
  it('has one fixture per block type and every fixture validates', () => {
    expect(Object.keys(blockFixtures).sort()).toEqual([...BLOCK_TYPES].sort());
    for (const type of BLOCK_TYPES) {
      const fixture = (blockFixtures as Record<string, unknown>)[type];
      expect(() => blockSchemas[type].parse(fixture)).not.toThrow();
    }
  });
});

describe('fixtures/page.sample.json', () => {
  it('validates against pageSchema', () => {
    expect(() => pageSchema.parse(pageFixture)).not.toThrow();
  });
});
