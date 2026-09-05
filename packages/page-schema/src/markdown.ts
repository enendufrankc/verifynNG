/**
 * Allow-list for the `rich-text` block's markdown. Raw HTML embedded in
 * markdown is the XSS vector here — everything not in this list is
 * stripped, not escaped, so both the builder preview and the web-verify
 * renderer can share one sanitiser and agree on what "safe" means.
 */
export const MARKDOWN_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h2',
  'h3',
  'h4',
] as const;

const STRIP_WITH_CONTENT =
  /<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/gi;
const STRIP_SELF_CLOSING = /<(script|style|iframe|object|embed)[^>]*\/?>/gi;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_ATTR =
  /\b(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
const HREF_ATTR = /href\s*=\s*("[^"]*"|'[^']*')/i;

const ALLOWED = new Set<string>(MARKDOWN_ALLOWED_TAGS);

/** Sanitises raw HTML that can appear inside a `rich-text` block's markdown. */
export function sanitizeMarkdown(md: string): string {
  let out = md.replace(STRIP_WITH_CONTENT, '').replace(STRIP_SELF_CLOSING, '');
  out = out.replace(EVENT_HANDLER_ATTR, '').replace(JS_URL_ATTR, '$1="#"');

  return out.replace(TAG, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED.has(tag)) return '';

    const isClosing = match.startsWith('</');
    if (isClosing) return `</${tag}>`;
    if (tag !== 'a') return `<${tag}>`;

    const hrefMatch = HREF_ATTR.exec(match);
    const href = hrefMatch ? hrefMatch[1] : '"#"';
    return `<a href=${href} rel="noopener">`;
  });
}
