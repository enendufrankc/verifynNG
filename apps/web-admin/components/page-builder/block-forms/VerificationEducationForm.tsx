import { Checkbox, FormField, Input, Label, Textarea } from '@verifyng/ui';
import type { VerificationEducationBlock } from '@verifynng/page-schema';

export function VerificationEducationForm({
  block,
  onChange,
}: {
  block: VerificationEducationBlock;
  onChange: (block: VerificationEducationBlock) => void;
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
      <FormField label="Body">
        <Textarea
          rows={3}
          value={block.body ?? ''}
          onChange={(e) =>
            onChange({ ...block, body: e.target.value || undefined })
          }
        />
      </FormField>
      <div className="flex items-center gap-2">
        <Checkbox
          id="ve-manual-link"
          checked={block.showManualEntryLink}
          onCheckedChange={(checked) =>
            onChange({ ...block, showManualEntryLink: checked === true })
          }
        />
        <Label htmlFor="ve-manual-link">
          Show "enter your code manually" link
        </Label>
      </div>
    </div>
  );
}
