import { z } from 'zod';

export const linkKindSchema = z.enum(['store', 'social', 'support', 'other']);

const linkItemSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
    kind: linkKindSchema,
  })
  .strict();

export const linksBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('links'),
    items: z.array(linkItemSchema),
  })
  .strict();

export type LinksBlock = z.infer<typeof linksBlockSchema>;

export function defaultLinksBlock(id: string): LinksBlock {
  return { id, type: 'links', items: [] };
}
