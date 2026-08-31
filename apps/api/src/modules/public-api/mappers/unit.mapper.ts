import type { Unit } from '@prisma/client';

/**
 * Explicit allow-list. `tier2Hash` is NEVER returned — only an 8-char
 * prefix, which on its own carries no verification value (see
 * docs/epics/E16-public-api-webhooks.md: "tier-2 never returned; tier1Code
 * and redacted hash only").
 */
export function toPublicUnit(unit: Unit) {
  return {
    id: unit.id,
    tenantId: unit.tenantId,
    batchId: unit.batchId,
    productId: unit.productId,
    tier1Code: unit.tier1Code,
    tier2HashRedacted: `${unit.tier2Hash.slice(0, 8)}…`,
    state: unit.state,
    serial: unit.serial,
    createdAt: unit.createdAt,
  };
}

export type PublicUnit = ReturnType<typeof toPublicUnit>;
