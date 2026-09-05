import { z } from 'zod';

export const paletteSchema = z
  .object({
    primary: z.string().min(1),
    accent: z.string().min(1),
    bg: z.string().min(1),
    ink: z.string().min(1),
  })
  .partial()
  .strict();

export const themeOverrideSchema = z
  .object({
    palette: paletteSchema.optional(),
    fontDisplay: z.string().min(1).optional(),
    fontBody: z.string().min(1).optional(),
  })
  .strict();

export const seoSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    ogImageAssetId: z.string().min(1).optional(),
    noindex: z.boolean().optional(),
  })
  .strict();

export type Palette = z.infer<typeof paletteSchema>;
export type ThemeOverride = z.infer<typeof themeOverrideSchema>;
export type Seo = z.infer<typeof seoSchema>;
