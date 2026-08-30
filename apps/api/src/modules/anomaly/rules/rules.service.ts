import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import rawDefaults from './defaults.json';
import {
  defaultsFileSchema,
  DefaultsFile,
  EffectiveRule,
  RuleId,
  RULE_IDS,
} from './rule-types';

/**
 * RulesService — the declarative rule catalog (`defaults.json`, schema-
 * validated at boot) merged with a tenant's `AnomalyRuleConfig` overrides.
 * No rule logic lives here; this only resolves *thresholds*.
 */
@Injectable()
export class RulesService implements OnModuleInit {
  private defaults!: DefaultsFile;

  constructor(private readonly prisma: PrismaClient) {}

  onModuleInit() {
    this.defaults = defaultsFileSchema.parse(rawDefaults);
  }

  private ensureLoaded(): DefaultsFile {
    // onModuleInit hasn't necessarily run yet in unit tests that construct
    // this service directly — parse defensively rather than throw.
    if (!this.defaults) this.defaults = defaultsFileSchema.parse(rawDefaults);
    return this.defaults;
  }

  definitions(): DefaultsFile {
    return this.ensureLoaded();
  }

  async effective(tenantId: string): Promise<Record<RuleId, EffectiveRule>> {
    const defaults = this.ensureLoaded();
    const overrides = await this.prisma.anomalyRuleConfig.findMany({
      where: { tenantId },
    });
    const overrideByRule = new Map(overrides.map((o) => [o.rule, o]));

    const result = {} as Record<RuleId, EffectiveRule>;
    for (const id of RULE_IDS) {
      const def = defaults[id]!;
      const override = overrideByRule.get(id);
      result[id] = {
        enabled: override?.enabled ?? true,
        thresholds: {
          ...def.defaults,
          ...((override?.thresholds as Record<string, number>) ?? {}),
        },
        score: def.score,
        autoFlagAt: def.autoFlagAt,
      };
    }
    return result;
  }

  async update(
    tenantId: string,
    patch: Partial<
      Record<RuleId, { enabled?: boolean; thresholds?: Record<string, number> }>
    >,
  ): Promise<Record<RuleId, EffectiveRule>> {
    const defaults = this.ensureLoaded();
    for (const [ruleId, value] of Object.entries(patch) as [
      RuleId,
      { enabled?: boolean; thresholds?: Record<string, number> },
    ][]) {
      if (!RULE_IDS.includes(ruleId)) continue;
      const existing = await this.prisma.anomalyRuleConfig.findUnique({
        where: { tenantId_rule: { tenantId, rule: ruleId } },
      });
      const mergedThresholds = {
        ...(existing?.thresholds as Record<string, number> | undefined),
        ...value.thresholds,
      };
      await this.prisma.anomalyRuleConfig.upsert({
        where: { tenantId_rule: { tenantId, rule: ruleId } },
        create: {
          tenantId,
          rule: ruleId,
          enabled: value.enabled ?? true,
          thresholds: Object.keys(mergedThresholds).length
            ? mergedThresholds
            : defaults[ruleId]!.defaults,
        },
        update: {
          ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
          ...(value.thresholds ? { thresholds: mergedThresholds } : {}),
        },
      });
    }
    return this.effective(tenantId);
  }
}
