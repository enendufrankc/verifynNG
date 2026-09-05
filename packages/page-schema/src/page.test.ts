import { describe, expect, it } from 'vitest';
import { defaultBlock } from './blocks';
import { CURRENT_SCHEMA_VERSION, migratePage, pageSchema } from './page';

function validPage() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    theme: { palette: { primary: '#C08A2D' } },
    blocks: [defaultBlock('hero')],
    seo: { title: 'Turmeric & Curcumin' },
  };
}

describe('pageSchema', () => {
  it('accepts a well-formed page', () => {
    const page = validPage();
    expect(pageSchema.parse(page)).toEqual(page);
  });

  it('accepts an empty-blocks page', () => {
    const page = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      theme: {},
      blocks: [],
      seo: {},
    };
    expect(pageSchema.parse(page)).toEqual(page);
  });

  it('rejects an unsupported schemaVersion', () => {
    expect(
      pageSchema.safeParse({ ...validPage(), schemaVersion: 99 }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(pageSchema.safeParse({ ...validPage(), extra: true }).success).toBe(
      false,
    );
  });
});

describe('migratePage', () => {
  it('parses an already-current page', () => {
    const page = validPage();
    expect(migratePage(page)).toEqual(page);
  });

  it('upgrades a legacy page with no schemaVersion, filling defaults', () => {
    const legacy = { blocks: [defaultBlock('faq')] };
    const migrated = migratePage(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.theme).toEqual({});
    expect(migrated.seo).toEqual({});
    expect(migrated.blocks).toEqual(legacy.blocks);
  });

  it('is idempotent', () => {
    const page = validPage();
    const once = migratePage(page);
    expect(migratePage(once)).toEqual(once);
  });

  it('throws on an unsupported schemaVersion', () => {
    expect(() => migratePage({ ...validPage(), schemaVersion: 2 })).toThrow(
      /Unsupported page schemaVersion/,
    );
  });
});
