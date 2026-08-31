import { z } from 'zod';
import { mediaRefSchema } from '../media';

const galleryItemSchema = z
  .object({
    media: mediaRefSchema,
    caption: z.string().min(1).optional(),
  })
  .strict();

export const galleryBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('gallery'),
    heading: z.string().min(1).optional(),
    items: z.array(galleryItemSchema).max(12),
  })
  .strict();

export type GalleryBlock = z.infer<typeof galleryBlockSchema>;

export function defaultGalleryBlock(id: string): GalleryBlock {
  return { id, type: 'gallery', items: [] };
}
