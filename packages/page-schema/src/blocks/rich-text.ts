import { z } from 'zod';

export const richTextBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('rich-text'),
    md: z.string(),
  })
  .strict();

export type RichTextBlock = z.infer<typeof richTextBlockSchema>;

export function defaultRichTextBlock(id: string): RichTextBlock {
  return { id, type: 'rich-text', md: '' };
}
