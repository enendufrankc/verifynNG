import { FormField, Textarea } from '@verifyng/ui';
import type { RichTextBlock } from '@verifynng/page-schema';

export function RichTextForm({
  block,
  onChange,
}: {
  block: RichTextBlock;
  onChange: (block: RichTextBlock) => void;
}) {
  return (
    <FormField
      label="Markdown"
      description="Basic formatting only — script/iframe/on* are stripped on render."
    >
      <Textarea
        rows={10}
        value={block.md}
        onChange={(e) => onChange({ ...block, md: e.target.value })}
      />
    </FormField>
  );
}
