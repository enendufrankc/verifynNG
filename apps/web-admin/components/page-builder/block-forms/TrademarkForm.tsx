import { Button, FormField, Input } from '@verifyng/ui';
import type { TrademarkBlock } from '@verifynng/page-schema';

export function TrademarkForm({
  block,
  onChange,
}: {
  block: TrademarkBlock;
  onChange: (block: TrademarkBlock) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Heading" htmlFor="block-heading">
        <Input
          id="block-heading"
          value={block.heading ?? ''}
          onChange={(e) =>
            onChange({ ...block, heading: e.target.value || undefined })
          }
        />
      </FormField>
      <div className="space-y-2">
        {block.marks.map((mark, i) => (
          <div
            key={i}
            className="border-border grid grid-cols-2 gap-2 rounded-md border p-2"
          >
            <Input
              aria-label="Mark name"
              value={mark.name}
              placeholder="Mark name"
              onChange={(e) => {
                const marks = [...block.marks];
                marks[i] = { ...marks[i], name: e.target.value };
                onChange({ ...block, marks });
              }}
            />
            <Input
              aria-label="Registration number"
              value={mark.number}
              placeholder="Registration number"
              onChange={(e) => {
                const marks = [...block.marks];
                marks[i] = { ...marks[i], number: e.target.value };
                onChange({ ...block, marks });
              }}
            />
            <Input
              aria-label="Class"
              value={mark.class}
              placeholder="Class"
              onChange={(e) => {
                const marks = [...block.marks];
                marks[i] = { ...marks[i], class: e.target.value };
                onChange({ ...block, marks });
              }}
            />
            <Input
              aria-label="Jurisdiction"
              value={mark.jurisdiction}
              placeholder="Jurisdiction"
              onChange={(e) => {
                const marks = [...block.marks];
                marks[i] = { ...marks[i], jurisdiction: e.target.value };
                onChange({ ...block, marks });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="col-span-2"
              onClick={() =>
                onChange({
                  ...block,
                  marks: block.marks.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove mark
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange({
              ...block,
              marks: [
                ...block.marks,
                { name: '', number: '', class: '', jurisdiction: '' },
              ],
            })
          }
        >
          Add mark
        </Button>
      </div>
    </div>
  );
}
