#!/usr/bin/env node
/**
 * `pnpm docs:check-links` — asserts every `docSlug="…"` used by a
 * `<HelpLink>` call anywhere in the repo resolves to a real page in
 * apps/docs (see docs/epics/E18-support-tooling.md T13).
 *
 * The valid-slug list below must stay in sync with
 * apps/docs/lib/content.ts's SLUG_TO_FILE map, plus "api" (a real page with
 * no content/ markdown file behind it — see apps/docs/app/docs/api/page.tsx).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const VALID_SLUGS = new Set([
  'codes',
  'labels',
  'printers',
  'faq',
  'api',
  'console/support',
  'console/help',
  'console/batches',
  'console/units',
  'console/anomalies',
  'console/reports',
  'console/team',
  'console/settings',
]);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  '.turbo',
  'coverage',
]);
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
}

const files = [];
walk(REPO_ROOT, files);

const docSlugPattern = /docSlug=["'`]([^"'`]+)["'`]/g;
const found = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(docSlugPattern)) {
    found.push({ file: file.replace(REPO_ROOT, ''), slug: match[1] });
  }
}

const missing = found.filter((f) => !VALID_SLUGS.has(f.slug));

if (found.length === 0) {
  console.log('docs:check-links — no <HelpLink docSlug="..."> usages found.');
} else {
  console.log(`docs:check-links — checked ${found.length} docSlug usage(s).`);
}

if (missing.length > 0) {
  console.error('\nThe following docSlug values do not resolve to a page in apps/docs:');
  for (const m of missing) {
    console.error(`  ${m.slug}  (${m.file})`);
  }
  process.exit(1);
}

console.log('All docSlug values resolve. OK.');
