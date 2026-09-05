import { marked } from 'marked';
import { sanitizeMarkdown } from '@verifynng/page-schema';
import type { RichTextBlock as RichTextBlockType } from '@verifynng/page-schema';

export async function RichTextBlock({ block }: { block: RichTextBlockType }) {
  const html = await marked.parse(sanitizeMarkdown(block.md));
  return (
    <section className="prose px-s5 py-s10 mx-auto max-w-2xl">
      {/* html is pre-sanitised — see packages/page-schema/src/markdown.ts */}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
