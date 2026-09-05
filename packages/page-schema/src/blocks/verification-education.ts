import { z } from 'zod';

export const verificationEducationBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('verification-education'),
    heading: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    showManualEntryLink: z.boolean(),
  })
  .strict();

export type VerificationEducationBlock = z.infer<
  typeof verificationEducationBlockSchema
>;

export function defaultVerificationEducationBlock(
  id: string,
): VerificationEducationBlock {
  return { id, type: 'verification-education', showManualEntryLink: true };
}
