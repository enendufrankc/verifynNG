import { Button, FormField, Input } from '@verifyng/ui';
import {
  PLACEHOLDER_MEDIA_REF,
  type GalleryBlock,
} from '@verifynng/page-schema';
import { MediaPicker } from '../MediaPicker';

export function GalleryForm({
  pageId,
  block,
  onChange,
}: {
  pageId: string;
  block: GalleryBlock;
  onChange: (block: GalleryBlock) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Heading">
        <Input
          value={block.heading ?? ''}
          onChange={(e) =>
            onChange({ ...block, heading: e.target.value || undefined })
          }
        />
      </FormField>
      <div className="space-y-3">
        {block.items.map((item, i) => (
          <div key={item.media.assetId + i} className="space-y-2">
            <MediaPicker
              pageId={pageId}
              label={`Photo ${i + 1}`}
              media={item.media}
              onChange={(media) => {
                const items = [...block.items];
                items[i] = { ...items[i], media };
                onChange({ ...block, items });
              }}
            />
            <Input
              value={item.caption ?? ''}
              placeholder="Caption"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = {
                  ...items[i],
                  caption: e.target.value || undefined,
                };
                onChange({ ...block, items });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...block,
                  items: block.items.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove photo
            </Button>
          </div>
        ))}
        {block.items.length < 12 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...block,
                items: [...block.items, { media: PLACEHOLDER_MEDIA_REF }],
              })
            }
          >
            Add photo
          </Button>
        )}
      </div>
    </div>
  );
}
