import { TicketStatus } from '@prisma/client';

/** Legal forward transitions for a support agent working a ticket by hand. */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'pending_customer', 'resolved', 'closed'],
  in_progress: ['pending_customer', 'resolved', 'closed', 'open'],
  pending_customer: ['in_progress', 'resolved', 'closed', 'open'],
  resolved: ['closed', 'open'],
  closed: ['open'],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/** A `reply` note from the requester reopens a resolved/closed ticket. */
export function nextStatusOnInboundReply(current: TicketStatus): TicketStatus {
  return current === 'resolved' || current === 'closed' ? 'open' : current;
}
