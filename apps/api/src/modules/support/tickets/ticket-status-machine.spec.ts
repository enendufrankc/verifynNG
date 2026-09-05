import { describe, expect, it } from 'vitest';
import {
  canTransition,
  nextStatusOnInboundReply,
} from './ticket-status-machine';

describe('canTransition', () => {
  it('allows the documented forward path', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'pending_customer')).toBe(true);
    expect(canTransition('pending_customer', 'resolved')).toBe(true);
    expect(canTransition('resolved', 'closed')).toBe(true);
  });

  it('allows reopening a resolved or closed ticket', () => {
    expect(canTransition('resolved', 'open')).toBe(true);
    expect(canTransition('closed', 'open')).toBe(true);
  });

  it('allows a no-op transition to the same status', () => {
    expect(canTransition('open', 'open')).toBe(true);
  });

  it('rejects skipping straight from closed to resolved', () => {
    expect(canTransition('closed', 'resolved')).toBe(false);
  });

  it('rejects skipping straight from closed to in_progress', () => {
    expect(canTransition('closed', 'in_progress')).toBe(false);
  });
});

describe('nextStatusOnInboundReply', () => {
  it('reopens a resolved ticket', () => {
    expect(nextStatusOnInboundReply('resolved')).toBe('open');
  });

  it('reopens a closed ticket', () => {
    expect(nextStatusOnInboundReply('closed')).toBe('open');
  });

  it('leaves an in-progress ticket alone', () => {
    expect(nextStatusOnInboundReply('in_progress')).toBe('in_progress');
  });

  it('leaves an open ticket alone', () => {
    expect(nextStatusOnInboundReply('open')).toBe('open');
  });
});
