'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  changeReportStatus,
  type ReportOutcome,
  type ReportStatus,
} from '@/lib/reports';

const NEXT_STATUS: Record<ReportStatus, ReportStatus[]> = {
  new: ['triaged', 'closed'],
  triaged: ['investigating', 'closed'],
  investigating: ['closed'],
  closed: ['investigating'],
};

export function StatusDialog({
  reportId,
  currentStatus,
  hasContact,
}: {
  reportId: string;
  currentStatus: ReportStatus;
  hasContact: boolean;
}) {
  const { activeTenantId } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ReportStatus>(
    NEXT_STATUS[currentStatus][0],
  );
  const [outcome, setOutcome] = useState<ReportOutcome | ''>('');
  const [note, setNote] = useState('');
  const [notifyConsumer, setNotifyConsumer] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      changeReportStatus(reportId, {
        status,
        outcome: outcome || undefined,
        note: note || undefined,
        notifyConsumer,
      }),
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.reports.detail(activeTenantId ?? '', reportId),
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast({
          title: 'This report changed since you loaded it',
          description: 'Refresh the page and try again.',
          variant: 'destructive',
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.reports.detail(activeTenantId ?? '', reportId),
        });
        return;
      }
      toast({
        title:
          error instanceof ApiError ? error.message : 'Status change failed',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Change status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>New status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ReportStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEXT_STATUS[currentStatus].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {status === 'closed' && (
            <div>
              <Label>Outcome (required to close)</Label>
              <Select
                value={outcome}
                onValueChange={(v) => setOutcome(v as ReportOutcome)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed_counterfeit">
                    Confirmed counterfeit
                  </SelectItem>
                  <SelectItem value="legit">Legit</SelectItem>
                  <SelectItem value="insufficient">
                    Insufficient evidence
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {hasContact && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="notify"
                checked={notifyConsumer}
                onCheckedChange={(c) => setNotifyConsumer(Boolean(c))}
              />
              <Label htmlFor="notify">Notify consumer</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={(status === 'closed' && !outcome) || mutation.isPending}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
