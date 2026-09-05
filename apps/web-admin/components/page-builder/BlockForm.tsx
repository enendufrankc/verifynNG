import type { Block } from '@verifynng/page-schema';
import { HeroForm } from './block-forms/HeroForm';
import { RichTextForm } from './block-forms/RichTextForm';
import { StoryForm } from './block-forms/StoryForm';
import { GalleryForm } from './block-forms/GalleryForm';
import { IngredientsForm } from './block-forms/IngredientsForm';
import { HowToUseForm } from './block-forms/HowToUseForm';
import { BatchInfoForm } from './block-forms/BatchInfoForm';
import { VerificationEducationForm } from './block-forms/VerificationEducationForm';
import { FaqForm } from './block-forms/FaqForm';
import { LinksForm } from './block-forms/LinksForm';
import { RegistrationForm } from './block-forms/RegistrationForm';
import { TrademarkForm } from './block-forms/TrademarkForm';

/** Dispatches one block to its editing form. Mirrors web-verify's BlockRenderer. */
export function BlockForm({
  pageId,
  block,
  onChange,
}: {
  pageId: string;
  block: Block;
  onChange: (block: Block) => void;
}) {
  switch (block.type) {
    case 'hero':
      return <HeroForm pageId={pageId} block={block} onChange={onChange} />;
    case 'rich-text':
      return <RichTextForm block={block} onChange={onChange} />;
    case 'story':
      return <StoryForm block={block} onChange={onChange} />;
    case 'gallery':
      return <GalleryForm pageId={pageId} block={block} onChange={onChange} />;
    case 'ingredients':
      return <IngredientsForm block={block} onChange={onChange} />;
    case 'how-to-use':
      return <HowToUseForm block={block} onChange={onChange} />;
    case 'batch-info':
      return <BatchInfoForm block={block} onChange={onChange} />;
    case 'verification-education':
      return <VerificationEducationForm block={block} onChange={onChange} />;
    case 'faq':
      return <FaqForm block={block} onChange={onChange} />;
    case 'links':
      return <LinksForm block={block} onChange={onChange} />;
    case 'registration':
      return <RegistrationForm block={block} onChange={onChange} />;
    case 'trademark':
      return <TrademarkForm block={block} onChange={onChange} />;
    default:
      return null;
  }
}
