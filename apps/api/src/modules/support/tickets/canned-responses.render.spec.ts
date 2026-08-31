import { describe, expect, it } from 'vitest';
import { CannedResponsesService } from './canned-responses.service';

describe('CannedResponsesService.render', () => {
  const service = new CannedResponsesService({} as never);

  it('substitutes known variables', () => {
    expect(
      service.render('Hi {{requesterName}}, ref #{{ticketNumber}}', {
        requesterName: 'Ada',
        ticketNumber: 1042,
      }),
    ).toBe('Hi Ada, ref #1042');
  });

  it('leaves unknown variables untouched', () => {
    expect(service.render('Hi {{requesterName}}', {})).toBe(
      'Hi {{requesterName}}',
    );
  });
});
