import { describe, it, expect, vi } from 'vitest';
import { SentryErrorTracker } from './sentry-error-tracker';
import { LogErrorTracker } from './log-error-tracker';

describe('SentryErrorTracker', () => {
  it('delegates to fallback LogErrorTracker when Sentry is not configured', () => {
    const fallbackMock = {
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      setUser: vi.fn(),
      setTenant: vi.fn(),
    } as unknown as LogErrorTracker;

    const tracker = new SentryErrorTracker(fallbackMock);
    const err = new Error('Test error');

    tracker.captureException(err, { requestId: 'req-sentry-1' });
    expect(fallbackMock.captureException).toHaveBeenCalledWith(err, {
      requestId: 'req-sentry-1',
    });

    tracker.captureMessage('Notice message', 'info');
    expect(fallbackMock.captureMessage).toHaveBeenCalledWith(
      'Notice message',
      'info',
      undefined,
    );
  });
});
