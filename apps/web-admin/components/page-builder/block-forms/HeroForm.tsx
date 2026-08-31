import { Button, FormField, Input } from '@verifyng/ui';
import type { HeroBlock } from '@verifynng/page-schema';
import { MediaPicker } from '../MediaPicker';

export function HeroForm({
  pageId,
  block,
  onChange,
}: {
  pageId: string;
  block: HeroBlock;
  onChange: (block: HeroBlock) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Eyebrow" htmlFor="hero-eyebrow">
        <Input
          id="hero-eyebrow"
          value={block.eyebrow ?? ''}
          onChange={(e) =>
            onChange({ ...block, eyebrow: e.target.value || undefined })
          }
        />
      </FormField>
      <FormField label="Title" required htmlFor="hero-title">
        <Input
          id="hero-title"
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </FormField>
      <FormField label="Subtitle" htmlFor="hero-subtitle">
        <Input
          id="hero-subtitle"
          value={block.subtitle ?? ''}
          onChange={(e) =>
            onChange({ ...block, subtitle: e.target.value || undefined })
          }
        />
      </FormField>
      <MediaPicker
        pageId={pageId}
        label="Hero image"
        media={block.image}
        onChange={(image) => onChange({ ...block, image })}
      />
      <FormField label="Stats" description="Up to 3 — value + label">
        <div className="space-y-2">
          {(block.stats ?? []).map((stat, i) => (
            <div key={i} className="flex gap-2">
              <Input
                aria-label="Stat value"
                value={stat.value}
                placeholder="10k+"
                onChange={(e) => {
                  const stats = [...(block.stats ?? [])];
                  stats[i] = { ...stats[i], value: e.target.value };
                  onChange({ ...block, stats });
                }}
              />
              <Input
                aria-label="Stat label"
                value={stat.label}
                placeholder="verified scans"
                onChange={(e) => {
                  const stats = [...(block.stats ?? [])];
                  stats[i] = { ...stats[i], label: e.target.value };
                  onChange({ ...block, stats });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...block,
                    stats: (block.stats ?? []).filter((_, idx) => idx !== i),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {(block.stats ?? []).length < 3 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                onChange({
                  ...block,
                  stats: [...(block.stats ?? []), { value: '', label: '' }],
                })
              }
            >
              Add stat
            </Button>
          )}
        </div>
      </FormField>
      <FormField label="Primary CTA label" htmlFor="hero-cta-label">
        <Input
          id="hero-cta-label"
          value={block.ctaPrimary?.label ?? ''}
          onChange={(e) =>
            onChange({
              ...block,
              ctaPrimary: e.target.value
                ? {
                    label: e.target.value,
                    href: block.ctaPrimary?.href ?? '#verify',
                  }
                : undefined,
            })
          }
        />
      </FormField>
      <FormField label="Primary CTA link" htmlFor="hero-cta-href">
        <Input
          id="hero-cta-href"
          value={block.ctaPrimary?.href ?? ''}
          onChange={(e) =>
            onChange({
              ...block,
              ctaPrimary: e.target.value
                ? { label: block.ctaPrimary?.label ?? '', href: e.target.value }
                : undefined,
            })
          }
        />
      </FormField>
    </div>
  );
}
