import { z } from 'zod';

export const storyBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('story'),
    kicker: z.string().min(1).optional(),
    heading: z.string().min(1),
    paragraphs: z.array(z.string().min(1)),
    attribution: z.string().min(1).optional(),
  })
  .strict();

export type StoryBlock = z.infer<typeof storyBlockSchema>;

export function defaultStoryBlock(id: string): StoryBlock {
  return { id, type: 'story', heading: 'Our story', paragraphs: [] };
}
