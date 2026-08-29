export type PolicyAcceptanceDecision =
  | { allowed: true }
  | {
      allowed: false;
      error: 'policy_acceptance_required';
      pending: string[];
    };

type PolicyDocumentRow = {
  kind: string;
  version: string;
  effectiveFrom: Date;
};

type PolicyAcceptanceRow = { kind: string; version: string };

export function pendingPolicyKinds(
  documents: PolicyDocumentRow[],
  accepted: PolicyAcceptanceRow[],
  now = new Date(),
): string[] {
  const latest = new Map<string, string>();
  for (const policy of documents) {
    if (policy.effectiveFrom <= now && !latest.has(policy.kind))
      latest.set(policy.kind, policy.version);
  }
  return ['aup', 'tos'].filter((kind) => {
    const version = latest.get(kind);
    return (
      version !== undefined &&
      !accepted.some((item) => item.kind === kind && item.version === version)
    );
  });
}

export function decidePolicyAcceptance(
  role: string | undefined,
  method: string,
  pending: string[],
  isPolicyAcceptanceRoute: boolean,
): PolicyAcceptanceDecision {
  if (role !== 'owner' || method === 'GET' || isPolicyAcceptanceRoute)
    return { allowed: true };
  if (pending.length === 0) return { allowed: true };
  return {
    allowed: false,
    error: 'policy_acceptance_required',
    pending,
  };
}
