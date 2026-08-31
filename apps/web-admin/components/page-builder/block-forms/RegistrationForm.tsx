import { Button, FormField, Input, Textarea } from '@verifyng/ui';
import type { RegistrationBlock } from '@verifynng/page-schema';

export function RegistrationForm({
  block,
  onChange,
}: {
  block: RegistrationBlock;
  onChange: (block: RegistrationBlock) => void;
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
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label="Row label"
              value={item.label}
              placeholder="Label"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...items[i], label: e.target.value };
                onChange({ ...block, items });
              }}
            />
            <Input
              aria-label="Row value"
              value={item.value}
              placeholder="Value"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...items[i], value: e.target.value };
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
              Remove
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
              items: [...block.items, { label: '', value: '' }],
            })
          }
        >
          Add row
        </Button>
      </div>
      <FormField
        label="Cautions"
        description="One per line"
        htmlFor="registration-cautions"
      >
        <Textarea
          id="registration-cautions"
          rows={4}
          value={(block.cautions ?? []).join('\n')}
          onChange={(e) =>
            onChange({
              ...block,
              cautions: e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </FormField>
    </div>
  );
}
