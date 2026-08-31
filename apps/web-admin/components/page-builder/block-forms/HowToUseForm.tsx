import { Button, FormField, Input, Textarea } from '@verifyng/ui';
import type { HowToUseBlock } from '@verifynng/page-schema';

export function HowToUseForm({
  block,
  onChange,
}: {
  block: HowToUseBlock;
  onChange: (block: HowToUseBlock) => void;
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
        {block.steps.map((step, i) => (
          <div
            key={i}
            className="border-border space-y-2 rounded-md border p-2"
          >
            <Input
              aria-label="Step title"
              value={step.title}
              placeholder="Step title"
              onChange={(e) => {
                const steps = [...block.steps];
                steps[i] = { ...steps[i], title: e.target.value };
                onChange({ ...block, steps });
              }}
            />
            <Textarea
              aria-label="Step body"
              rows={2}
              value={step.body}
              placeholder="Step body"
              onChange={(e) => {
                const steps = [...block.steps];
                steps[i] = { ...steps[i], body: e.target.value };
                onChange({ ...block, steps });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...block,
                  steps: block.steps.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove step
            </Button>
          </div>
        ))}
        {block.steps.length < 6 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...block,
                steps: [...block.steps, { title: '', body: '' }],
              })
            }
          >
            Add step
          </Button>
        )}
      </div>
    </div>
  );
}
