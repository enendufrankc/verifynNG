import { z } from 'zod';

export type RuleId =
  | 'geo_dispersion'
  | 'velocity'
  | 'dead_code'
  | 'pre_reveal'
  | 'duplicate_first';

export const RULE_IDS: RuleId[] = [
  'geo_dispersion',
  'velocity',
  'dead_code',
  'pre_reveal',
  'duplicate_first',
];

export interface RuleDefinition {
  id: RuleId;
  trigger: 'event' | 'sweep' | 'both';
  defaults: Record<string, number>;
  score: number;
  autoFlagAt: number;
  description: string;
}

export interface EffectiveRule {
  enabled: boolean;
  thresholds: Record<string, number>;
  score: number;
  autoFlagAt: number;
}

const ruleDefinitionSchema = z.object({
  trigger: z.enum(['event', 'sweep', 'both']),
  defaults: z.record(z.string(), z.number()),
  score: z.number().int().min(1).max(100),
  autoFlagAt: z.number().int().min(1).max(100),
  description: z.string().min(1),
});

export const defaultsFileSchema = z.record(
  z.enum(RULE_IDS as [RuleId, ...RuleId[]]),
  ruleDefinitionSchema,
);

export type DefaultsFile = z.infer<typeof defaultsFileSchema>;

/**
 * `EffectiveRule.thresholds` is a generic `Record<string, number>` at rest
 * (it's merged from JSON + a Prisma `Json` column), but each rule's pure
 * evaluator wants its own named shape. The shape is guaranteed by
 * `defaultsFileSchema` validation at boot plus the merge in
 * `RulesService.effective` — this cast just names that guarantee at the
 * call site instead of threading five bespoke generic types through.
 */
export function asThresholds<T extends Record<string, number>>(
  thresholds: Record<string, number>,
): T {
  return thresholds as T;
}
