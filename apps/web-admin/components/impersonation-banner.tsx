'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { EyeIcon } from 'lucide-react';
import { useImpersonationStore } from '@/lib/impersonation-store';
import { useAuthStore } from '@/lib/auth-store';
import { endImpersonation, startImpersonation } from '@/lib/impersonation';
import { ApiError } from '@/lib/api-client';

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * E18's slot in E11's console shell (see docs/epics/E18-support-tooling.md
 * T4 — E11 has no dedicated `Banner` primitive yet, so this renders inline
 * rather than through one; swap for a shared component if E11 adds one).
 * Rendered by `(console)/layout.tsx` on every page, but only ever shows
 * anything when this tab's sessionStorage carries an active impersonation.
 */
export function ImpersonationBanner() {
  const state = useImpersonationStore();
  const { toast } = useToast();
  const [tick, setTick] = useState(0);
  const [elevateOpen, setElevateOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.sessionId || !state.expiresAt) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      if (new Date(state.expiresAt!).getTime() <= Date.now()) {
        state.markExpired();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  if (!state.sessionId) return null;

  const handleEnd = async () => {
    setBusy(true);
    try {
      await endImpersonation(state.sessionId!);
    } catch {
      /* best-effort — the guard/expiry job will clean it up regardless */
    } finally {
      state.clear();
      useAuthStore.getState().clear();
      window.location.href = '/login';
    }
  };

  const handleElevate = async () => {
    if (reason.trim().length < 20) return;
    setBusy(true);
    try {
      const result = await startImpersonation({
        tenantId: state.tenantId!,
        mode: 'write',
        reason,
      });
      useAuthStore.getState().setAccessToken(result.token);
      useAuthStore.getState().setActiveTenant(result.tenantId, 'operator');
      state.set({
        sessionId: result.id,
        tenantId: result.tenantId,
        tenantName: state.tenantName ?? '',
        mode: 'write',
        expiresAt: result.expiresAt,
      });
      setElevateOpen(false);
      setReason('');
      toast({ title: 'Elevated to write mode' });
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : 'Could not elevate',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const expired = state.expired;
  void tick; // re-render trigger for the countdown

  return (
    <div
      className={
        state.mode === 'write'
          ? 'bg-v-flag flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-white'
          : 'bg-v-susp flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-white'
      }
      role="status"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <EyeIcon className="h-4 w-4 shrink-0" />
        {expired ? (
          <span>Session expired</span>
        ) : (
          <span>
            Viewing {state.tenantName || state.tenantId} as support ·{' '}
            {state.mode === 'write' ? 'WRITE MODE' : 'read-only'} · expires in{' '}
            {formatCountdown(state.expiresAt!)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!expired && state.mode === 'read' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setElevateOpen(true)}
          >
            Elevate
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleEnd}
          disabled={busy}
        >
          End session
        </Button>
      </div>

      <Dialog open={elevateOpen} onOpenChange={setElevateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elevate to write mode</DialogTitle>
          </DialogHeader>
          <p className="text-fg-muted text-sm">
            Explain why you need to make changes as this tenant (at least 20
            characters). This is recorded on the impersonation record and in the
            audit log —{' '}
            <a href="/docs/support-impersonation-policy" className="underline">
              read the policy
            </a>
            .
          </p>
          <FormField label="Reason" htmlFor="elevate-reason" required>
            <Textarea
              id="elevate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </FormField>
          <DialogFooter>
            <Button
              onClick={handleElevate}
              disabled={busy || reason.trim().length < 20}
            >
              Elevate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
