import { z } from 'zod';

const ingredientItemSchema = z
  .object({
    name: z.string().min(1),
    percent: z.number().min(0).max(100).optional(),
    role: z.string().min(1),
    note: z.string().min(1).optional(),
  })
  .strict();

export const ingredientsBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('ingredients'),
    heading: z.string().min(1).optional(),
    items: z.array(ingredientItemSchema),
  })
  .strict();

export type IngredientsBlock = z.infer<typeof ingredientsBlockSchema>;

export function defaultIngredientsBlock(id: string): IngredientsBlock {
  return { id, type: 'ingredients', items: [] };
}
