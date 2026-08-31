import { z } from 'zod';

export const batchInfoBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('batch-info'),
    heading: z.string().min(1).optional(),
    showOem: z.boolean(),
    showCommissionDate: z.boolean(),
  })
  .strict();

export type BatchInfoBlock = z.infer<typeof batchInfoBlockSchema>;

export function defaultBatchInfoBlock(id: string): BatchInfoBlock {
  return { id, type: 'batch-info', showOem: true, showCommissionDate: true };
}
