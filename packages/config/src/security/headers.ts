/**
 * Shared security headers for the Verify Platform.
 *
 * Applied by both the API (helmet) and Next.js middleware.
 */

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '0', // disabled; CSP is the modern replacement
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=()',
};
