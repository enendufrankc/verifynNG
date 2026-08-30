/**
 * Redact a tier-1 code for display to non-operator roles. Mirrors
 * @verifynng/core's redactCode (not imported directly to keep this a pure
 * client-side string op with no bundling surface).
 */
export function redactCode(code: string): string {
  const parts = code.split('.');
  if (parts.length === 5) {
    const [tenant, tier, kid, payload] = parts;
    return `${tenant}.${tier}.${kid}.${payload.slice(0, 4)}…`;
  }
  if (parts.length === 4) {
    const [tenant, tier, payload] = parts;
    return `${tenant}.${tier}.${payload.slice(0, 4)}…`;
  }
  return '***';
}
