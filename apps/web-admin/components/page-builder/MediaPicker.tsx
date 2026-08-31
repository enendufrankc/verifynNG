'use client';

import { useState } from 'react';
import { Button, FormField, Input } from '@verifyng/ui';
import { uploadPageMedia } from '@/lib/product-pages';
import type { MediaRef } from '@verifynng/page-schema';

/** Image picker for a block field — uploads via T4's pipeline. Alt text is required. */
export function MediaPicker({
  pageId,
  label,
  media,
  onChange,
}: {
  pageId: string;
  label: string;
  media?: MediaRef;
  onChange: (media: MediaRef) => void;
}) {
  const [alt, setAlt] = useState(media?.alt ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const altFieldId = `media-alt-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  async function handleFile(file: File) {
    if (!alt.trim()) {
      setError('Alt text is required before uploading');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await uploadPageMedia(pageId, file, alt.trim());
      onChange(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-border space-y-2 rounded-md border p-3">
      <p className="text-fg text-sm font-medium">{label}</p>
      {media && (
        <img
          src={media.variants.webp[0]}
          alt={media.alt}
          className="h-24 w-24 rounded object-cover"
        />
      )}
      <FormField label="Alt text" required htmlFor={altFieldId}>
        <Input
          id={altFieldId}
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="Describe the image"
        />
      </FormField>
      <label className="inline-block">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          asChild
        >
          <span>
            {uploading
              ? 'Uploading…'
              : media
                ? 'Replace image'
                : 'Upload image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </span>
        </Button>
      </label>
      {error && (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
