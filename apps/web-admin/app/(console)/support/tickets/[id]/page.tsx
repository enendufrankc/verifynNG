'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  addTicketNote,
  getPlatformTicket,
  listCannedResponses,
  updatePlatformTicket,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support';
import { startImpersonation } from '@/lib/impersonation';

export default function SupportTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [cannedResponseId, setCannedResponseId] = useState<
    string | undefined
  >();

  const ticketQuery = useQuery({
    queryKey: queryKeys.support.ticket(id),
    queryFn: () => getPlatformTicket(id),
  });
  const cannedQuery = useQuery({
    queryKey: queryKeys.support.cannedResponses(),
    queryFn: listCannedResponses,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.support.ticket(id) });

  const updateMutation = useMutation({
    mutationFn: (input: {
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
    }) => updatePlatformTicket(id, input),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      toast({
        title: err instanceof ApiError ? err.message : 'Update failed',
        variant: 'destructive',
      }),
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      addTicketNote(id, {
        kind: internal ? 'internal' : 'reply',
        body: reply || undefined,
        cannedResponseId,
      }),
    onSuccess: () => {
      setReply('');
      setCannedResponseId(undefined);
      invalidate();
    },
    onError: (err: unknown) =>
      toast({
        title: err instanceof ApiError ? err.message : 'Could not add note',
        variant: 'destructive',
      }),
  });

  const viewAsTenant = async () => {
    const ticket = ticketQuery.data;
    if (!ticket?.tenantId) return;
    try {
      const result = await startImpersonation({
        tenantId: ticket.tenantId,
        mode: 'read',
      });
      const url = new URL('/impersonate', window.location.origin);
      url.searchParams.set('token', result.token);
      url.searchParams.set('tenantId', result.tenantId);
      url.searchParams.set('mode', result.mode);
      url.searchParams.set('expiresAt', result.expiresAt);
      url.searchParams.set('sessionId', result.id);
      window.open(url.toString(), '_blank', 'noopener');
    } catch (err) {
      toast({
        title:
          err instanceof ApiError
            ? err.message
            : 'Could not start impersonation',
        variant: 'destructive',
      });
    }
  };

  const ticket = ticketQuery.data;
  if (!ticket) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`#${ticket.number} — ${ticket.subject}`}
        description={`${ticket.requesterEmail} · ${ticket.channel}`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={ticket.status}
          onValueChange={(v) =>
            updateMutation.mutate({ status: v as TicketStatus })
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="pending_customer">Pending customer</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={ticket.priority}
          onValueChange={(v) =>
            updateMutation.mutate({ priority: v as TicketPriority })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        {ticket.relatedCode && (
          <Badge variant="secondary">{ticket.relatedCode}</Badge>
        )}
        {ticket.tenantId && (
          <Button size="sm" variant="secondary" onClick={viewAsTenant}>
            View as tenant
          </Button>
        )}
      </div>

      <div className="border-border space-y-4 rounded-md border p-4">
        <div className="text-sm">
          <p className="text-fg-muted">Original message</p>
          <p>{ticket.body}</p>
        </div>
        {ticket.notes.map((note) => (
          <div
            key={note.id}
            className={
              note.kind === 'internal'
                ? 'bg-v-susp-tint rounded-md p-3 text-sm'
                : 'bg-surface-sunken rounded-md p-3 text-sm'
            }
          >
            <p className="text-fg-muted mb-1 text-xs uppercase">
              {note.kind} · {new Date(note.createdAt).toLocaleString()}
            </p>
            <p>{note.body}</p>
          </div>
        ))}
      </div>

      <div className="border-border space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={internal} onCheckedChange={setInternal} />
            Internal note (not sent to requester)
          </label>
          {!internal && (
            <Select
              value={cannedResponseId}
              onValueChange={setCannedResponseId}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Canned response…" />
              </SelectTrigger>
              <SelectContent>
                {cannedQuery.data?.map((response) => (
                  <SelectItem key={response.id} value={response.id}>
                    {response.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={
            cannedResponseId
              ? 'Canned response will be used — add anything extra here.'
              : 'Write a reply…'
          }
          rows={4}
        />
        <Button
          onClick={() => noteMutation.mutate()}
          disabled={noteMutation.isPending || (!reply && !cannedResponseId)}
        >
          {internal ? 'Add internal note' : 'Send reply'}
        </Button>
      </div>
    </div>
  );
}
