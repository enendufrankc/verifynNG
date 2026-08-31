import { z } from 'zod';

const stepSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
  })
  .strict();

export const howToUseBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('how-to-use'),
    heading: z.string().min(1).optional(),
    steps: z.array(stepSchema).max(6),
  })
  .strict();

export type HowToUseBlock = z.infer<typeof howToUseBlockSchema>;

export function defaultHowToUseBlock(id: string): HowToUseBlock {
  return { id, type: 'how-to-use', steps: [] };
}
