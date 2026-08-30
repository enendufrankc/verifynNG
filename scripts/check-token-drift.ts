/**
 * CI check: packages/ui tokens must match docs/design/foundations/tokens-v0.2-turquoise.css
 * Run: npx tsx scripts/check-token-drift.ts
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const sourcePath = resolve(
  root,
  'docs/design/foundations/tokens-v0.2-turquoise.css',
);
const pkgPath = resolve(root, 'packages/ui/src/tokens.css');

const sourceContent = readFileSync(sourcePath, 'utf-8');
const pkgContent = readFileSync(pkgPath, 'utf-8');

const sourceTokens = new Map<string, string>();
const tokenRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
let match: RegExpExecArray | null;
while ((match = tokenRegex.exec(sourceContent)) !== null) {
  sourceTokens.set(match[1], match[2].trim());
}

/** Normalize a CSS value for comparison */
function normalize(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\s+/g, '')
      // Normalize decimal: .05 → 0.05 (CSS allows both forms)
      .replace(/([,(-])\.(\d)/g, '$10.$2')
      .replace(/['']/g, "'")
  );
}

const errors: string[] = [];
const normalizedPkg = normalize(pkgContent);

for (const [key, expectedValue] of sourceTokens) {
  if (expectedValue.includes('linear-gradient')) continue;
  if (expectedValue.startsWith('var(')) continue;

  const normalizedValue = normalize(expectedValue);
  if (!normalizedPkg.includes(normalizedValue)) {
    errors.push(
      `Token --${key} value "${expectedValue}" not found in packages/ui/src/tokens.css`,
    );
  }
}

if (errors.length > 0) {
  console.error('❌ Token drift detected!');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log('✅ No token drift — packages/ui matches docs/design/foundations/');
