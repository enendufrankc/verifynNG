import { z } from 'zod';

export const mediaVariantsSchema = z
  .object({
    webp: z.array(z.string().min(1)).min(1),
    avif: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const mediaRefSchema = z
  .object({
    assetId: z.string().min(1),
    alt: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    blurDataUrl: z.string().min(1).optional(),
    variants: mediaVariantsSchema,
  })
  .strict();

export type MediaVariants = z.infer<typeof mediaVariantsSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;

/** Satisfies required-image block fields before a tenant has uploaded anything. */
export const PLACEHOLDER_MEDIA_REF: MediaRef = {
  assetId: 'placeholder',
  alt: '',
  width: 1,
  height: 1,
  variants: { webp: ['/placeholder.webp'] },
};
