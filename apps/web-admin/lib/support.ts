import { apiClient } from './api-client';

export interface TenantDirectoryRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  ownerEmail: string | null;
  unitsThisYear: number;
  scansLast30d: number;
  lastActivityAt: string | null;
  planCode: string | null;
}

export interface TenantDirectoryDetail extends TenantDirectoryRow {
  recentAudit: Array<{
    id: string;
    action: string;
    createdAt: string;
    actorId: string | null;
  }>;
}

export function listTenants(params: { q?: string; status?: string }) {
  const query: Record<string, string> = {};
  if (params.q) query.q = params.q;
  if (params.status) query.status = params.status;
  return apiClient.get<{ items: TenantDirectoryRow[]; cursor?: string }>(
    '/v1/platform/tenants',
    { query },
  );
}

export function getTenant(tenantId: string) {
  return apiClient.get<TenantDirectoryDetail>(
    `/v1/platform/tenants/${tenantId}`,
  );
}

// ── Tickets (platform side) ───────────────────────────────────────

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'pending_customer'
  | 'resolved'
  | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketChannel = 'console' | 'public' | 'email';

export interface TicketNote {
  id: string;
  authorId: string | null;
  kind: 'internal' | 'reply' | 'system';
  body: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  tenantId: string | null;
  requesterEmail: string;
  channel: TicketChannel;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  pageUrl: string | null;
  relatedCode: string | null;
  lastActivityAt: string;
  createdAt: string;
  notes: TicketNote[];
}

export function listPlatformTickets(params: {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  tenantId?: string;
}) {
  const query: Record<string, string> = {};
  if (params.status) query.status = params.status;
  if (params.priority) query.priority = params.priority;
  if (params.assigneeId) query.assigneeId = params.assigneeId;
  if (params.tenantId) query.tenantId = params.tenantId;
  return apiClient.get<{ items: Ticket[]; cursor?: string }>(
    '/v1/platform/tickets',
    { query },
  );
}

export function getPlatformTicket(id: string) {
  return apiClient.get<Ticket>(`/v1/platform/tickets/${id}`);
}

export function updatePlatformTicket(
  id: string,
  input: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
  },
) {
  return apiClient.patch<Ticket>(`/v1/platform/tickets/${id}`, input);
}

export function addTicketNote(
  id: string,
  input: {
    kind: 'internal' | 'reply';
    body?: string;
    cannedResponseId?: string;
  },
) {
  return apiClient.post<TicketNote>(`/v1/platform/tickets/${id}/notes`, input);
}

// ── Canned responses ───────────────────────────────────────────────

export interface CannedResponse {
  id: string;
  slug: string;
  title: string;
  body: string;
}

export function listCannedResponses() {
  return apiClient.get<CannedResponse[]>('/v1/platform/canned-responses');
}

export function createCannedResponse(input: {
  slug: string;
  title: string;
  body: string;
}) {
  return apiClient.post<CannedResponse>('/v1/platform/canned-responses', input);
}

export function updateCannedResponse(
  id: string,
  input: { title?: string; body?: string },
) {
  return apiClient.patch<CannedResponse>(
    `/v1/platform/canned-responses/${id}`,
    input,
  );
}

export function deleteCannedResponse(id: string) {
  return apiClient.delete<void>(`/v1/platform/canned-responses/${id}`);
}

// ── Tickets (tenant / console-help side) ───────────────────────────

export function createHelpTicket(
  tenantId: string,
  input: { subject: string; body: string; pageUrl?: string },
) {
  return apiClient.post<Ticket>(
    `/v1/tenants/${tenantId}/support/tickets`,
    input,
  );
}

export function listOwnTickets(tenantId: string) {
  return apiClient.get<{ items: Ticket[]; cursor?: string }>(
    `/v1/tenants/${tenantId}/support/tickets`,
  );
}
