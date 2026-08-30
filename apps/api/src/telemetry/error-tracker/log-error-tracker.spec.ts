import { describe, it, expect, vi } from 'vitest';
import { LogErrorTracker } from './log-error-tracker';
import { AppLogger } from '../logger';

describe('LogErrorTracker', () => {
  it('captures exception and delegates to AppLogger with context', () => {
    const loggerMock = {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    } as unknown as AppLogger;

    const tracker = new LogErrorTracker(loggerMock);
    const err = new Error('Database connection failed');

    tracker.captureException(err, { requestId: 'req-test-99' });

    expect(loggerMock.error).toHaveBeenCalled();
    const calls = vi.mocked(loggerMock.error).mock.calls;
    const callArg = calls[0][0] as Record<string, Record<string, unknown>>;
    expect(callArg.event).toBe('error_tracker.exception');
    expect(callArg.error.message).toBe('Database connection failed');
    expect(callArg.context.requestId).toBe('req-test-99');
  });

  it('captures messages with severity levels', () => {
    const loggerMock = {
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    } as unknown as AppLogger;

    const tracker = new LogErrorTracker(loggerMock);

    tracker.captureMessage('High memory usage', 'warning');
    expect(loggerMock.warn).toHaveBeenCalled();

    tracker.captureMessage('Fatal crash', 'error');
    expect(loggerMock.error).toHaveBeenCalled();
  });
});
