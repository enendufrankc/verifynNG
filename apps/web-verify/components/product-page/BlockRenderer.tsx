import type { Block } from '@verifynng/page-schema';
import { HeroBlock } from './blocks/HeroBlock';
import { RichTextBlock } from './blocks/RichTextBlock';
import { StoryBlock } from './blocks/StoryBlock';
import { GalleryBlock } from './blocks/GalleryBlock';
import { IngredientsBlock } from './blocks/IngredientsBlock';
import { HowToUseBlock } from './blocks/HowToUseBlock';
import { BatchInfoBlock, type BatchContext } from './blocks/BatchInfoBlock';
import { VerificationEducationBlock } from './blocks/VerificationEducationBlock';
import { FaqBlock } from './blocks/FaqBlock';
import { LinksBlock } from './blocks/LinksBlock';
import { RegistrationBlock } from './blocks/RegistrationBlock';
import { TrademarkBlock } from './blocks/TrademarkBlock';

/** Dispatches one page-schema block to its renderer. One file per block, per T6. */
export function BlockRenderer({
  block,
  batchContext,
}: {
  block: Block;
  batchContext?: BatchContext;
}) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock block={block} />;
    case 'rich-text':
      return <RichTextBlock block={block} />;
    case 'story':
      return <StoryBlock block={block} />;
    case 'gallery':
      return <GalleryBlock block={block} />;
    case 'ingredients':
      return <IngredientsBlock block={block} />;
    case 'how-to-use':
      return <HowToUseBlock block={block} />;
    case 'batch-info':
      return <BatchInfoBlock block={block} context={batchContext} />;
    case 'verification-education':
      return <VerificationEducationBlock block={block} />;
    case 'faq':
      return <FaqBlock block={block} />;
    case 'links':
      return <LinksBlock block={block} />;
    case 'registration':
      return <RegistrationBlock block={block} />;
    case 'trademark':
      return <TrademarkBlock block={block} />;
    default:
      return null;
  }
}
