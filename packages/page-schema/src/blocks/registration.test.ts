import { describe, expect, it } from 'vitest';
import {
  defaultRegistrationBlock,
  registrationBlockSchema,
} from './registration';

describe('registrationBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultRegistrationBlock('r1');
    expect(registrationBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts items and cautions', () => {
    const block = {
      id: 'r1',
      type: 'registration' as const,
      heading: 'Regulatory',
      items: [{ label: 'NAFDAC Reg. No.', value: '01-1234' }],
      cautions: ['Keep out of reach of children.'],
    };
    expect(registrationBlockSchema.parse(block)).toEqual(block);
  });

  it('rejects unknown keys', () => {
    expect(
      registrationBlockSchema.safeParse({
        ...defaultRegistrationBlock('r1'),
        foo: 1,
      }).success,
    ).toBe(false);
  });
});
