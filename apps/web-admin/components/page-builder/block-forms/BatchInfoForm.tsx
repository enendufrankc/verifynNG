import { Checkbox, FormField, Input, Label } from '@verifyng/ui';
import type { BatchInfoBlock } from '@verifynng/page-schema';

export function BatchInfoForm({
  block,
  onChange,
}: {
  block: BatchInfoBlock;
  onChange: (block: BatchInfoBlock) => void;
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
      <div className="flex items-center gap-2">
        <Checkbox
          id="batch-info-oem"
          checked={block.showOem}
          onCheckedChange={(checked) =>
            onChange({ ...block, showOem: checked === true })
          }
        />
        <Label htmlFor="batch-info-oem">Show manufacturer</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="batch-info-date"
          checked={block.showCommissionDate}
          onCheckedChange={(checked) =>
            onChange({ ...block, showCommissionDate: checked === true })
          }
        />
        <Label htmlFor="batch-info-date">Show commission date</Label>
      </div>
      <p className="text-fg-muted text-sm">
        Batch, manufacturer and date are filled automatically from the scanned
        unit — this block cannot be removed from the tier-1 verdict view.
      </p>
    </div>
  );
}
