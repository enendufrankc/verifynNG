# `pnpm oem:receipt` — the printer's receipt CLI

A factory (OEM) prints the tier-2 codes from the manifest you sent them, then
runs this tool over whatever CSV their printer/scanner line exported, to prove
back to the platform that what got printed matches what was delivered — without
ever needing the platform's signing key.

## Install / run

No install step inside this monorepo — it's a workspace package:

```
pnpm oem:receipt <printed.csv> [--column tier2Code] [--out receipt.json] [--submit <url> --token <jwt>]
```

Outside the monorepo (an OEM with no `pnpm`, no Node project), build the
single-file executable once and hand them `dist/cli.js`:

```
pnpm --filter @verifynng/oem-receipt build
node tools/oem-receipt/dist/cli.js <printed.csv> ...
```

`dist/cli.js` bundles `@verifynng/core` in — it needs nothing else installed,
just a Node runtime.

## What it does

1. Reads the CSV, extracting one column (`--column`, default `tier2Code`).
2. Parses every code with `@verifynng/core`'s `parseCode` — malformed rows
   (empty, wrong shape, bad length) are dropped and counted, not fatal.
3. Computes:
   - `receiptHash` — order-independent SHA-256 over every valid code (same
     algorithm the platform used when it built the manifest).
   - `codeCount` — how many valid codes were found.
   - `watermarks` — every _distinct_ 4-character batch watermark seen
     (`core.watermarkOf` reads it straight out of each code's payload — no key
     needed). A clean batch has exactly one. Two or more means a foreign code
     got mixed in somewhere in the print run.
4. Prints the summary. With `--out`, also writes `{ receiptHash, codeCount,
watermarks }` as JSON — paste this into the OEM portal's receipt form, or
   feed it straight through with `--submit`.
5. With `--submit <url> --token <jwt>`, POSTs that JSON to
   `<url>` (the full receipt endpoint, e.g.
   `http://localhost:4000/v1/oem/deliveries/<id>/receipt`) with the OEM's
   bearer token, and prints the platform's verdict.

The CLI never contacts a signing key or the platform to do its own
computation — it only reads the CSV. Verification of the _hash_ (does this
match what was actually delivered) happens server-side, where the real
manifest lives.

## Example

```
$ pnpm oem:receipt tools/oem-receipt/fixtures/printed-ok.csv
Parsed 20 row(s) from tools/oem-receipt/fixtures/printed-ok.csv
  codeCount:    20
  watermark(s): T7HX
  receiptHash:  7ae5320f73e9e3fe897e062d930dcf39ef06f6f4893a1e52000183e1ea0ab886

$ pnpm oem:receipt tools/oem-receipt/fixtures/printed-swapped.csv
Parsed 20 row(s) from tools/oem-receipt/fixtures/printed-swapped.csv
  codeCount:    20
  watermark(s): FRGN, T7HX
  receiptHash:  7ed8c9cddbe56a47d8b082e3a3853e38cca9d3d525bb6ba8598a8551f4b7b649
```

`printed-swapped.csv` is the same 20 codes with one swapped for a code from a
different batch — notice the second watermark. Submitting either fixture
against a _real_ delivery won't match (they're synthetic codes, not printed
from an actual manifest) — they exist to exercise the CLI's own parsing and
hashing logic. To see a real match/mismatch against a live batch, print the
`tier2Code` column straight out of a downloaded manifest.

## CSV format

One column holds the printed code (default header `tier2Code`); anything else
in the file is ignored. `--column` overrides the header name if the printer's
export uses something else. Quoted fields and CRLF line endings are handled;
this is not a full RFC 4180 parser (no multi-line quoted fields).
