/**
 * GS1 Digital Link URI builder and parser.
 *
 * Format: https://<baseUrl>/01/<GTIN>/10/<lot>/21/<serial>
 *
 * GTIN, lot, and serial are the GS1 application identifiers.
 * This enables industry-standard product identification and
 * future compatibility with GS1 resolvers.
 */

export interface Gs1DigitalLinkParams {
  baseUrl: string;
  gtin: string;
  lot?: string;
  serial?: string;
}

export interface ParsedGs1DigitalLink {
  gtin: string;
  lot?: string;
  serial?: string;
}

/**
 * Build a GS1 Digital Link URI.
 */
export function toGs1DigitalLink({
  baseUrl,
  gtin,
  lot,
  serial,
}: Gs1DigitalLinkParams): string {
  // Normalize baseUrl — strip trailing slash
  const base = baseUrl.replace(/\/+$/, '');
  let uri = `${base}/01/${gtin}`;
  if (lot) uri += `/10/${lot}`;
  if (serial) uri += `/21/${serial}`;
  return uri;
}

/**
 * Safely parse a URL. Returns null if the URL is invalid.
 */
function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Parse a GS1 Digital Link URI.
 * Returns null if the URI doesn't match the expected format.
 */
export function parseGs1DigitalLink(url: string): ParsedGs1DigitalLink | null {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);

  // Minimum: /01/<GTIN> — filter(Boolean) ensures segments[1] is non-empty
  if (segments.length < 2 || segments[0] !== '01') return null;

  const gtin = segments[1];
  let lot: string | undefined;
  let serial: string | undefined;

  for (let i = 2; i < segments.length - 1; i += 2) {
    const ai = segments[i];
    const value = segments[i + 1];
    if (ai === '10') {
      lot = value;
    } else if (ai === '21') {
      serial = value;
    }
  }

  return { gtin, lot, serial };
}
