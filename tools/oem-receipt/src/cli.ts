#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseCsv, extractColumn } from './csv.js';
import { buildReceipt } from './receipt-builder.js';

/**
 * Resolves a user-given path against the directory the user actually ran
 * `pnpm oem:receipt` from — not this package's directory, which is where
 * `pnpm --filter ... run start` sets cwd. pnpm always exports INIT_CWD for
 * exactly this case; a bundled `dist/cli.js` run directly falls back to cwd.
 */
function resolveFromInvocationDir(path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

interface Args {
  file: string;
  column: string;
  out?: string;
  submit?: string;
  token?: string;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  let column = 'tier2Code';
  let out: string | undefined;
  let submit: string | undefined;
  let token: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--column') column = argv[++i];
    else if (arg === '--out') out = argv[++i];
    else if (arg === '--submit') submit = argv[++i];
    else if (arg === '--token') token = argv[++i];
    else positionals.push(arg);
  }

  if (positionals.length !== 1) {
    console.error(
      'Usage: oem-receipt <printed.csv> [--column tier2Code] [--out receipt.json] [--submit <url> --token <jwt>]',
    );
    process.exit(1);
  }

  return { file: positionals[0], column, out, submit, token };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const text = readFileSync(resolveFromInvocationDir(args.file), 'utf8');
  const rows = parseCsv(text);
  const codes = extractColumn(rows, args.column);
  const summary = buildReceipt(codes);

  console.log(`Parsed ${codes.length} row(s) from ${args.file}`);
  if (summary.malformedCount > 0) {
    console.log(`  Dropped ${summary.malformedCount} malformed code(s)`);
  }
  console.log(`  codeCount:    ${summary.codeCount}`);
  console.log(`  watermark(s): ${summary.watermarks.join(', ') || '(none)'}`);
  console.log(`  receiptHash:  ${summary.receiptHash}`);

  const receipt = {
    receiptHash: summary.receiptHash,
    codeCount: summary.codeCount,
    watermarks: summary.watermarks,
  };

  if (args.out) {
    writeFileSync(
      resolveFromInvocationDir(args.out),
      JSON.stringify(receipt, null, 2),
    );
    console.log(`Wrote ${args.out}`);
  }

  if (args.submit) {
    if (!args.token) {
      console.error('--submit requires --token <jwt>');
      process.exit(1);
    }
    const res = await fetch(args.submit, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.token}`,
      },
      body: JSON.stringify(receipt),
    });
    const body: unknown = await res.json().catch(() => undefined);
    console.log(`Submit → ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
    if (!res.ok) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
