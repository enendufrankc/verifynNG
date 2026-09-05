import { describe, expect, it } from 'vitest';
import { MARKDOWN_ALLOWED_TAGS, sanitizeMarkdown } from './markdown';

describe('sanitizeMarkdown', () => {
  it('removes script tags and their content', () => {
    expect(sanitizeMarkdown('hi <script>alert(1)</script> there')).toBe(
      'hi  there',
    );
  });

  it('removes self-closing iframe tags', () => {
    expect(sanitizeMarkdown('<iframe src="evil.com"/>text')).toBe('text');
  });

  it('removes on* event handler attributes', () => {
    expect(sanitizeMarkdown('<p onclick="doEvil()">safe</p>')).toBe(
      '<p>safe</p>',
    );
  });

  it('neutralises javascript: URLs', () => {
    expect(sanitizeMarkdown('<a href="javascript:alert(1)">click</a>')).toBe(
      '<a href="#" rel="noopener">click</a>',
    );
  });

  it('keeps allowed tags and strips their other attributes', () => {
    for (const tag of MARKDOWN_ALLOWED_TAGS) {
      if (tag === 'a' || tag === 'br') continue;
      expect(sanitizeMarkdown(`<${tag} class="x">content</${tag}>`)).toBe(
        `<${tag}>content</${tag}>`,
      );
    }
  });

  it('keeps br as a self-closing-looking allowed tag', () => {
    expect(sanitizeMarkdown('line one<br>line two')).toBe(
      'line one<br>line two',
    );
  });

  it('adds rel="noopener" to anchors and keeps their href', () => {
    expect(sanitizeMarkdown('<a href="https://example.com">go</a>')).toBe(
      '<a href="https://example.com" rel="noopener">go</a>',
    );
  });

  it('defaults an anchor with no href to "#"', () => {
    expect(sanitizeMarkdown('<a>go</a>')).toBe(
      '<a href="#" rel="noopener">go</a>',
    );
  });

  it('strips disallowed tags but keeps their text content', () => {
    expect(sanitizeMarkdown('<div class="x">kept text</div>')).toBe(
      'kept text',
    );
  });

  it('leaves plain markdown untouched', () => {
    expect(sanitizeMarkdown('**bold** and _italic_')).toBe(
      '**bold** and _italic_',
    );
  });
});
