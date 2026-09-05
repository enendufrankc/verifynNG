import { z } from 'zod';

const registrationItemSchema = z
  .object({
    label: z.string().min(1),
    value: z.string().min(1),
  })
  .strict();

export const registrationBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('registration'),
    heading: z.string().min(1).optional(),
    items: z.array(registrationItemSchema),
    cautions: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type RegistrationBlock = z.infer<typeof registrationBlockSchema>;

export function defaultRegistrationBlock(id: string): RegistrationBlock {
  return { id, type: 'registration', items: [] };
}
