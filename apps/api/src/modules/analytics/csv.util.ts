const BOM = String.fromCharCode(0xfeff);

/**
 * Serialises rows to CSV with a UTF-8 BOM (Excel-friendly) and CRLF line
 * endings. Fields containing a comma, quote, or newline are quoted, with
 * embedded quotes doubled per RFC 4180.
 */
export function toCsv<T extends object>(
  rows: T[],
  columns: (keyof T & string)[],
): string {
  const escape = (value: unknown): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(escape).join(',')];
  for (const row of rows)
    lines.push(columns.map((col) => escape(row[col])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
