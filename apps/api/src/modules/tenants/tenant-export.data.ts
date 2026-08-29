type ExportableRow = Record<string, unknown>;

export function exportRows(
  collection: string,
  rows: readonly ExportableRow[],
): ExportableRow[] {
  return rows.map((row) => {
    const safe = { ...row };
    delete safe.tier1Code;
    return collection === 'units'
      ? safe
      : Object.fromEntries(
          Object.entries(safe).filter(([key]) => key !== 'passwordHash'),
        );
  });
}

export function ndjson(rows: readonly ExportableRow[]): string {
  return (
    rows.map((row) => JSON.stringify(row)).join('\n') +
    (rows.length ? '\n' : '')
  );
}
