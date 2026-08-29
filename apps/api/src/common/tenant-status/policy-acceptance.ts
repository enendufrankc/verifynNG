export type PolicyAcceptanceDecision =
  | { allowed: true }
  | {
      allowed: false;
      error: 'policy_acceptance_required';
      pending: string[];
    };

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
