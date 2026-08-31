import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES, blockSchema, blockSchemas, defaultBlock } from './index';

describe('BLOCK_TYPES / blockSchemas', () => {
  it('has a schema for every block type', () => {
    for (const type of BLOCK_TYPES) {
      expect(blockSchemas[type]).toBeDefined();
    }
    expect(Object.keys(blockSchemas).sort()).toEqual([...BLOCK_TYPES].sort());
  });
});

describe('defaultBlock', () => {
  it('returns a schema-valid block with a unique id for every type', () => {
    const ids = new Set<string>();
    for (const type of BLOCK_TYPES) {
      const block = defaultBlock(type);
      expect(block.type).toBe(type);
      expect(() => blockSchemas[type].parse(block)).not.toThrow();
      expect(() => blockSchema.parse(block)).not.toThrow();
      ids.add(block.id);
    }
    expect(ids.size).toBe(BLOCK_TYPES.length);
  });
});

describe('blockSchema', () => {
  it('rejects an unknown discriminant', () => {
    expect(
      blockSchema.safeParse({ id: 'x', type: 'unknown-block' }).success,
    ).toBe(false);
  });
});
