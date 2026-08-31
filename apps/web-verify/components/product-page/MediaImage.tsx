import Image from 'next/image';
import type { MediaRef } from '@verifynng/page-schema';

/** Renders a `MediaRef` (T4's pipeline output) via next/image, largest webp variant first. */
export function MediaImage({
  media,
  className,
  sizes,
  priority,
}: {
  media: MediaRef;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const src =
    media.variants.webp[media.variants.webp.length - 1] ??
    media.variants.webp[0];
  if (!src) return null;

  return (
    <Image
      src={src}
      alt={media.alt}
      width={media.width}
      height={media.height}
      className={className}
      sizes={sizes}
      priority={priority}
      placeholder={media.blurDataUrl ? 'blur' : 'empty'}
      blurDataURL={media.blurDataUrl}
    />
  );
}
