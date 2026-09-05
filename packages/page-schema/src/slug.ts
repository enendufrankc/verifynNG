const DIACRITICS = /[̀-ͯ]/g;
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const MAX_LENGTH = 80;

/** Tenant-facing URL segment normaliser shared by the builder and the API. */
export function normalizeSlug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(NON_SLUG_CHARS, '-')
    .replace(EDGE_HYPHENS, '')
    .slice(0, MAX_LENGTH);
}
