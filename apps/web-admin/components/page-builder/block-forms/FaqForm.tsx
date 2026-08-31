import { Button, Input, Textarea } from '@verifyng/ui';
import type { FaqBlock } from '@verifynng/page-schema';

export function FaqForm({
  block,
  onChange,
}: {
  block: FaqBlock;
  onChange: (block: FaqBlock) => void;
}) {
  return (
    <div className="space-y-2">
      {block.items.map((item, i) => (
        <div key={i} className="border-border space-y-2 rounded-md border p-2">
          <Input
            aria-label="Question"
            value={item.q}
            placeholder="Question"
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], q: e.target.value };
              onChange({ ...block, items });
            }}
          />
          <Textarea
            aria-label="Answer"
            rows={2}
            value={item.a}
            placeholder="Answer"
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], a: e.target.value };
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
          onChange({ ...block, items: [...block.items, { q: '', a: '' }] })
        }
      >
        Add question
      </Button>
    </div>
  );
}
