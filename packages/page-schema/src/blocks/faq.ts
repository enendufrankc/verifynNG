import { z } from 'zod';

const faqItemSchema = z
  .object({
    q: z.string().min(1),
    a: z.string().min(1),
  })
  .strict();

export const faqBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('faq'),
    items: z.array(faqItemSchema),
  })
  .strict();

export type FaqBlock = z.infer<typeof faqBlockSchema>;

export function defaultFaqBlock(id: string): FaqBlock {
  return { id, type: 'faq', items: [] };
}
