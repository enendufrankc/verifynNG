import { z } from 'zod';

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'invalid_hex_colour');

export const brandingSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  logoUrl: z
    .string()
    .regex(/^tenants\/[^/]+\/branding\/[^/]+$/, 'invalid_logo_key')
    .optional(),
  primaryColor: hexColour.optional(),
  accentColor: hexColour.optional(),
  supportEmail: z.string().email().max(320).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  websiteUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith('https://'), 'https_required')
    .optional(),
});

export type Branding = z.infer<typeof brandingSchema>;
