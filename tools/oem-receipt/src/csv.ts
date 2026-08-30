/**
 * Minimal CSV parser — no external dependency, matching this tool's "depends
 * only on @verifynng/core" contract. Handles a header row, comma separation,
 * double-quoted fields (with "" escaping), and CRLF/LF line endings. Enough
 * for a printer/scanner export; not a full RFC 4180 implementation.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  const normalized = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  // Trailing field/row (files without a final newline)
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Extracts one named column's values from a CSV with a header row. */
export function extractColumn(rows: string[][], columnName: string): string[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const index = header.indexOf(columnName);
  if (index === -1) {
    throw new Error(
      `Column "${columnName}" not found. Header: ${header.join(', ')}`,
    );
  }
  return rows.slice(1).map((r) => (r[index] ?? '').trim());
}
