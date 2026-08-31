import { Button, FormField, Input, Textarea } from '@verifyng/ui';
import type { StoryBlock } from '@verifynng/page-schema';

export function StoryForm({
  block,
  onChange,
}: {
  block: StoryBlock;
  onChange: (block: StoryBlock) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Kicker">
        <Input
          value={block.kicker ?? ''}
          onChange={(e) =>
            onChange({ ...block, kicker: e.target.value || undefined })
          }
        />
      </FormField>
      <FormField label="Heading" required>
        <Input
          value={block.heading}
          onChange={(e) => onChange({ ...block, heading: e.target.value })}
        />
      </FormField>
      <FormField label="Paragraphs">
        <div className="space-y-2">
          {block.paragraphs.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Textarea
                rows={3}
                value={p}
                onChange={(e) => {
                  const paragraphs = [...block.paragraphs];
                  paragraphs[i] = e.target.value;
                  onChange({ ...block, paragraphs });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...block,
                    paragraphs: block.paragraphs.filter((_, idx) => idx !== i),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({ ...block, paragraphs: [...block.paragraphs, ''] })
            }
          >
            Add paragraph
          </Button>
        </div>
      </FormField>
      <FormField label="Attribution">
        <Input
          value={block.attribution ?? ''}
          onChange={(e) =>
            onChange({ ...block, attribution: e.target.value || undefined })
          }
        />
      </FormField>
    </div>
  );
}
