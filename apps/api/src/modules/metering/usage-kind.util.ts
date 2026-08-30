import { UsageKind } from '@prisma/client';

// The API always serialises UsageKind as dotted names ("code.minted"), never
// the Prisma enum's underscore form ("code_minted").
const DOTTED: Record<UsageKind, string> = {
  code_minted: 'code.minted',
  scan_tier1: 'scan.tier1',
  scan_tier2: 'scan.tier2',
  api_call: 'api.call',
  notification_sent: 'notification.sent',
};

export function toDottedKind(kind: UsageKind): string {
  return DOTTED[kind];
}

export const ALL_USAGE_KINDS: UsageKind[] = [
  UsageKind.code_minted,
  UsageKind.scan_tier1,
  UsageKind.scan_tier2,
  UsageKind.api_call,
  UsageKind.notification_sent,
];
