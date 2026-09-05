import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

const CONTENT_DIR = join(process.cwd(), 'content');

export interface DocPage {
  slug: string;
  title: string;
  markdown: string;
  html: string;
  /** Plain text, for client-side search. */
  text: string;
}

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_BASE_URL ?? 'http://localhost:3001';
}

function verifyBaseUrl(): string {
  return process.env.NEXT_PUBLIC_VERIFY_BASE_URL ?? 'http://localhost:3000';
}

function interpolate(markdown: string): string {
  return markdown
    .replaceAll('{{CONSOLE}}', appBaseUrl())
    .replaceAll('{{VERIFY}}', verifyBaseUrl());
}

function titleOf(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>|-]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** slug -> content filename, since a few slugs have `/` the filesystem can't hold directly. */
const SLUG_TO_FILE: Record<string, string> = {
  codes: 'codes.md',
  labels: 'labels.md',
  printers: 'printers.md',
  faq: 'faq.md',
  'console/support': 'console-support.md',
  'console/help': 'console-help.md',
  'console/batches': 'console-batches.md',
  'console/units': 'console-units.md',
  'console/anomalies': 'console-anomalies.md',
  'console/reports': 'console-reports.md',
  'console/team': 'console-team.md',
  'console/settings': 'console-settings.md',
};

export function listSlugs(): string[] {
  return Object.keys(SLUG_TO_FILE);
}

export function getDocPage(slug: string): DocPage | null {
  const filename = SLUG_TO_FILE[slug];
  if (!filename) return null;
  const raw = readFileSync(join(CONTENT_DIR, filename), 'utf8');
  const markdown = interpolate(raw);
  return {
    slug,
    title: titleOf(markdown),
    markdown,
    html: marked.parse(markdown, { async: false }) as string,
    text: stripMarkdown(markdown),
  };
}

export function getAllDocPages(): DocPage[] {
  return listSlugs()
    .map(getDocPage)
    .filter((p): p is DocPage => p !== null);
}

/** Sanity check that every file in content/ is actually wired to a slug — a stray unmapped file is a mistake, not a feature. */
export function unmappedContentFiles(): string[] {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const mapped = new Set(Object.values(SLUG_TO_FILE));
  return files.filter((f) => !mapped.has(f));
}
