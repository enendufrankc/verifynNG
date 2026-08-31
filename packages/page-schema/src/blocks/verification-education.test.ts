import { describe, expect, it } from 'vitest';
import {
  defaultVerificationEducationBlock,
  verificationEducationBlockSchema,
} from './verification-education';

describe('verificationEducationBlockSchema', () => {
  it('accepts the default block', () => {
    const block = defaultVerificationEducationBlock('v1');
    expect(verificationEducationBlockSchema.parse(block)).toEqual(block);
  });

  it('accepts heading and body', () => {
    const block = {
      id: 'v1',
      type: 'verification-education' as const,
      heading: 'How verification works',
      body: 'Scan the QR code on your product.',
      showManualEntryLink: false,
    };
    expect(verificationEducationBlockSchema.parse(block)).toEqual(block);
  });

  it('requires showManualEntryLink', () => {
    const block: Record<string, unknown> = {
      ...defaultVerificationEducationBlock('v1'),
    };
    delete block.showManualEntryLink;
    expect(verificationEducationBlockSchema.safeParse(block).success).toBe(
      false,
    );
  });

  it('rejects unknown keys', () => {
    expect(
      verificationEducationBlockSchema.safeParse({
        ...defaultVerificationEducationBlock('v1'),
        foo: 1,
      }).success,
    ).toBe(false);
  });
});
