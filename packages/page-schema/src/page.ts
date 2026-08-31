import { z } from 'zod';
import { blockSchema } from './blocks';
import { seoSchema, themeOverrideSchema } from './theme';

export const CURRENT_SCHEMA_VERSION = 1;

export const pageSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    theme: themeOverrideSchema,
    blocks: z.array(blockSchema),
    seo: seoSchema,
  })
  .strict();

export type Page = z.infer<typeof pageSchema>;

/**
 * Normalises a page to the current schema version. Every page currently
 * shipped is `schemaVersion: 1`; this is the single seam future schema
 * migrations hang off so the builder, API and renderer never need their own
 * copy of the upgrade logic.
 */
export function migratePage(page: unknown): Page {
  const version = (page as { schemaVersion?: unknown } | null)?.schemaVersion;

  if (version === undefined) {
    return pageSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      theme: {},
      blocks: [],
      seo: {},
      ...(page as object),
    });
  }

  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported page schemaVersion: ${String(version)}`);
  }

  return pageSchema.parse(page);
}
