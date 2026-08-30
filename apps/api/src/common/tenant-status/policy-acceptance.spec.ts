import { describe, expect, it } from 'vitest';
import { decidePolicyAcceptance } from './policy-acceptance';

describe('decidePolicyAcceptance', () => {
  it('blocks owner writes when policies are pending', () => {
    expect(decidePolicyAcceptance('owner', 'PATCH', ['tos'], false)).toEqual({
      allowed: false,
      error: 'policy_acceptance_required',
      pending: ['tos'],
    });
  });

  it('allows owner reads and policy acceptance while pending', () => {
    expect(decidePolicyAcceptance('owner', 'GET', ['tos'], false)).toEqual({
      allowed: true,
    });
    expect(decidePolicyAcceptance('owner', 'POST', ['tos'], true)).toEqual({
      allowed: true,
    });
  });

  it('does not gate viewer or operator requests', () => {
    expect(decidePolicyAcceptance('viewer', 'PATCH', ['tos'], false)).toEqual({
      allowed: true,
    });
    expect(decidePolicyAcceptance('operator', 'POST', ['tos'], false)).toEqual({
      allowed: true,
    });
  });
});
