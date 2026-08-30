import type { PolicyKind, PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONTENT_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'content',
  'legal',
);

interface SeedDoc {
  kind: PolicyKind;
  urlSlug: string;
  version: string;
  effectiveFrom: Date;
}

// `aup`/`tos` already have a "2026-08-01" row from seed/policies.ts — this
// upserts that same row with the real authored content rather than adding a
// second version, so each kind still has exactly one "v1". `privacy`,
// `cookie`, `subprocessors` are new and start at version "1".
const DOCS: SeedDoc[] = [
  {
    kind: 'privacy',
    urlSlug: 'privacy',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
  {
    kind: 'tos',
    urlSlug: 'terms',
    version: '2026-08-01',
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
  },
  {
    kind: 'aup',
    urlSlug: 'aup',
    version: '2026-08-01',
    effectiveFrom: new Date('2026-08-01T00:00:00Z'),
  },
  {
    kind: 'cookie',
    urlSlug: 'cookie',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
  {
    kind: 'subprocessors',
    urlSlug: 'subprocessors',
    version: '1',
    effectiveFrom: new Date('2026-08-30T00:00:00Z'),
  },
];

export async function seedLegalDocuments(prisma: PrismaClient): Promise<void> {
  for (const doc of DOCS) {
    const markdown = readFileSync(
      join(CONTENT_ROOT, doc.urlSlug, 'en.md'),
      'utf-8',
    );
    await prisma.policyDocument.upsert({
      where: {
        kind_locale_version: {
          kind: doc.kind,
          locale: 'en',
          version: doc.version,
        },
      },
      update: { markdown },
      create: {
        kind: doc.kind,
        locale: 'en',
        version: doc.version,
        markdown,
        effectiveFrom: doc.effectiveFrom,
      },
    });
  }
}
