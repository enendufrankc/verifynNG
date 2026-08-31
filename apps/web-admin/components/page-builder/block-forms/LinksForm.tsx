import { Button, Input } from '@verifyng/ui';
import type { LinksBlock } from '@verifynng/page-schema';

const KINDS = ['store', 'social', 'support', 'other'] as const;

export function LinksForm({
  block,
  onChange,
}: {
  block: LinksBlock;
  onChange: (block: LinksBlock) => void;
}) {
  return (
    <div className="space-y-2">
      {block.items.map((item, i) => (
        <div
          key={i}
          className="border-border grid grid-cols-4 gap-2 rounded-md border p-2"
        >
          <Input
            value={item.label}
            placeholder="Label"
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], label: e.target.value };
              onChange({ ...block, items });
            }}
          />
          <Input
            value={item.href}
            placeholder="https://…"
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], href: e.target.value };
              onChange({ ...block, items });
            }}
          />
          <select
            className="border-border rounded-md border px-2 text-sm"
            value={item.kind}
            onChange={(e) => {
              const items = [...block.items];
              items[i] = {
                ...items[i],
                kind: e.target.value as (typeof KINDS)[number],
              };
              onChange({ ...block, items });
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
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
            items: [...block.items, { label: '', href: '', kind: 'store' }],
          })
        }
      >
        Add link
      </Button>
    </div>
  );
}
