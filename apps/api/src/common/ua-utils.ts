/**
 * Classify a User-Agent string into a device class.
 */
export function classifyUa(
  userAgent: string | undefined,
): 'mobile' | 'desktop' | 'bot' | 'unknown' {
  if (!userAgent) return 'unknown';
  const lower = userAgent.toLowerCase();

  // Bot detection first
  if (/bot|crawl|spider|slurp|headless/i.test(lower)) return 'bot';
  // Mobile detection
  if (/mobile|android|iphone|ipod/i.test(lower)) return 'mobile';
  // Desktop detection
  if (/windows|macintosh|linux|x11/i.test(lower)) return 'desktop';

  return 'unknown';
}
