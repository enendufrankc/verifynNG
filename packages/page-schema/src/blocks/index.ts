import { z } from 'zod';
import { batchInfoBlockSchema, defaultBatchInfoBlock } from './batch-info';
import { faqBlockSchema, defaultFaqBlock } from './faq';
import { galleryBlockSchema, defaultGalleryBlock } from './gallery';
import { heroBlockSchema, defaultHeroBlock } from './hero';
import { howToUseBlockSchema, defaultHowToUseBlock } from './how-to-use';
import { ingredientsBlockSchema, defaultIngredientsBlock } from './ingredients';
import { linksBlockSchema, defaultLinksBlock } from './links';
import {
  registrationBlockSchema,
  defaultRegistrationBlock,
} from './registration';
import { richTextBlockSchema, defaultRichTextBlock } from './rich-text';
import { storyBlockSchema, defaultStoryBlock } from './story';
import { trademarkBlockSchema, defaultTrademarkBlock } from './trademark';
import {
  verificationEducationBlockSchema,
  defaultVerificationEducationBlock,
} from './verification-education';

export * from './batch-info';
export * from './faq';
export * from './gallery';
export * from './hero';
export * from './how-to-use';
export * from './ingredients';
export * from './links';
export * from './registration';
export * from './rich-text';
export * from './story';
export * from './trademark';
export * from './verification-education';

export const BLOCK_TYPES = [
  'hero',
  'rich-text',
  'story',
  'gallery',
  'ingredients',
  'how-to-use',
  'batch-info',
  'verification-education',
  'faq',
  'links',
  'registration',
  'trademark',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const blockSchemas: Record<BlockType, z.ZodTypeAny> = {
  hero: heroBlockSchema,
  'rich-text': richTextBlockSchema,
  story: storyBlockSchema,
  gallery: galleryBlockSchema,
  ingredients: ingredientsBlockSchema,
  'how-to-use': howToUseBlockSchema,
  'batch-info': batchInfoBlockSchema,
  'verification-education': verificationEducationBlockSchema,
  faq: faqBlockSchema,
  links: linksBlockSchema,
  registration: registrationBlockSchema,
  trademark: trademarkBlockSchema,
};

export const blockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  richTextBlockSchema,
  storyBlockSchema,
  galleryBlockSchema,
  ingredientsBlockSchema,
  howToUseBlockSchema,
  batchInfoBlockSchema,
  verificationEducationBlockSchema,
  faqBlockSchema,
  linksBlockSchema,
  registrationBlockSchema,
  trademarkBlockSchema,
]);

export type Block = z.infer<typeof blockSchema>;

const defaultFactories: Record<BlockType, (id: string) => Block> = {
  hero: defaultHeroBlock,
  'rich-text': defaultRichTextBlock,
  story: defaultStoryBlock,
  gallery: defaultGalleryBlock,
  ingredients: defaultIngredientsBlock,
  'how-to-use': defaultHowToUseBlock,
  'batch-info': defaultBatchInfoBlock,
  'verification-education': defaultVerificationEducationBlock,
  faq: defaultFaqBlock,
  links: defaultLinksBlock,
  registration: defaultRegistrationBlock,
  trademark: defaultTrademarkBlock,
};

/** New block of `type` with a fresh id and schema-valid placeholder content. */
export function defaultBlock(type: BlockType): Block {
  return defaultFactories[type](crypto.randomUUID());
}
