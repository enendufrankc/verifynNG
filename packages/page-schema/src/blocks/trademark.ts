import { z } from 'zod';
import { mediaRefSchema } from '../media';

const trademarkMarkSchema = z
  .object({
    name: z.string().min(1),
    number: z.string().min(1),
    class: z.string().min(1),
    jurisdiction: z.string().min(1),
    imageRef: mediaRefSchema.optional(),
  })
  .strict();

export const trademarkBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('trademark'),
    heading: z.string().min(1).optional(),
    marks: z.array(trademarkMarkSchema),
  })
  .strict();

export type TrademarkBlock = z.infer<typeof trademarkBlockSchema>;

export function defaultTrademarkBlock(id: string): TrademarkBlock {
  return { id, type: 'trademark', marks: [] };
}
