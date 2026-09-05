import { Button, FormField, Input } from '@verifyng/ui';
import type { IngredientsBlock } from '@verifynng/page-schema';

export function IngredientsForm({
  block,
  onChange,
}: {
  block: IngredientsBlock;
  onChange: (block: IngredientsBlock) => void;
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
          <div
            key={i}
            className="border-border grid grid-cols-4 gap-2 rounded-md border p-2"
          >
            <Input
              aria-label="Ingredient name"
              value={item.name}
              placeholder="Name"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...items[i], name: e.target.value };
                onChange({ ...block, items });
              }}
            />
            <Input
              aria-label="Ingredient role"
              value={item.role}
              placeholder="Role"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = { ...items[i], role: e.target.value };
                onChange({ ...block, items });
              }}
            />
            <Input
              aria-label="Ingredient percent"
              type="number"
              value={item.percent ?? ''}
              placeholder="%"
              onChange={(e) => {
                const items = [...block.items];
                items[i] = {
                  ...items[i],
                  percent: e.target.value ? Number(e.target.value) : undefined,
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
              items: [...block.items, { name: '', role: '' }],
            })
          }
        >
          Add ingredient
        </Button>
      </div>
    </div>
  );
}
