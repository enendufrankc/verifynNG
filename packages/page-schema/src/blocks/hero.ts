import { z } from 'zod';
import { mediaRefSchema, PLACEHOLDER_MEDIA_REF } from '../media';

const ctaSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
  })
  .strict();

const statSchema = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const heroBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('hero'),
    eyebrow: z.string().min(1).optional(),
    title: z.string().min(1),
    subtitle: z.string().min(1).optional(),
    stats: z.array(statSchema).max(3).optional(),
    ctaPrimary: ctaSchema.optional(),
    ctaSecondary: ctaSchema.optional(),
    image: mediaRefSchema,
    variantImages: z.array(mediaRefSchema).optional(),
  })
  .strict();

export type HeroBlock = z.infer<typeof heroBlockSchema>;

export function defaultHeroBlock(id: string): HeroBlock {
  return {
    id,
    type: 'hero',
    title: 'New product',
    image: PLACEHOLDER_MEDIA_REF,
  };
}
