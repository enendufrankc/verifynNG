'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  Button,
  CodeBlock,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  Switch,
} from '@verifyng/ui';
import { AlertTriangleIcon, MonitorIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  changePassword,
  disableMfa,
  enableMfa,
  listSessions,
  revokeAllSessions,
  revokeSession,
  setupMfa,
  type MfaSetup,
} from '@/lib/security';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(12, 'At least 12 characters'),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type PasswordInput = z.infer<typeof passwordSchema>;

export default function SettingsSecurityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mfaWizardOpen, setMfaWizardOpen] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const passwordForm = useZodForm<PasswordInput>(passwordSchema, {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => passwordForm.reset(),
    onError: (error: unknown) => setServerErrors(passwordForm, error),
  });

  const sessionsQuery = useQuery({
    queryKey: ['settings', 'sessions'],
    queryFn: listSessions,
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] }),
  });

  const revokeAllMutation = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: () => {
      setRevokeAllOpen(false);
      queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
  });

  const setupMutation = useMutation({
    mutationFn: setupMfa,
    onSuccess: (data) => {
      setMfaSetup(data);
      setMfaWizardOpen(true);
    },
  });

  const enableMutation = useMutation({
    mutationFn: () => enableMfa(mfaCode),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes);
      setMfaCode('');
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableMfa(disableCode),
    onSuccess: () => {
      setDisableOpen(false);
      setDisableCode('');
    },
  });

  function closeMfaWizard() {
    setMfaWizardOpen(false);
    setMfaSetup(null);
    setMfaCode('');
    setRecoveryCodes(null);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-fg text-lg font-semibold">Change password</h2>
        <Form
          form={passwordForm}
          onSubmit={(values) => passwordMutation.mutate(values)}
          className="max-w-sm space-y-4"
        >
          <FormField
            label="Current password"
            htmlFor="currentPassword"
            error={passwordForm.formState.errors.currentPassword?.message}
            required
          >
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...passwordForm.register('currentPassword')}
            />
          </FormField>
          <FormField
            label="New password"
            htmlFor="newPassword"
            error={passwordForm.formState.errors.newPassword?.message}
            required
          >
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register('newPassword')}
            />
          </FormField>
          <FormField
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={passwordForm.formState.errors.confirmPassword?.message}
            required
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...passwordForm.register('confirmPassword')}
            />
          </FormField>
          <Button type="submit" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending ? 'Saving…' : 'Update password'}
          </Button>
        </Form>
      </section>

      <section className="space-y-4">
        <h2 className="text-fg text-lg font-semibold">
          Two-factor authentication
        </h2>
        <div className="flex max-w-sm items-center justify-between">
          <div>
            <p className="text-fg text-sm">
              {user?.mfaEnabled ? 'MFA is enabled' : 'MFA is disabled'}
            </p>
            <p className="text-fg-muted text-sm">
              Require a TOTP code at login in addition to your password.
            </p>
          </div>
          <Switch
            checked={!!user?.mfaEnabled}
            onCheckedChange={(checked) =>
              checked ? setupMutation.mutate() : setDisableOpen(true)
            }
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-fg text-lg font-semibold">Sessions</h2>
        {sessionsQuery.isError ? (
          <EmptyState
            icon={AlertTriangleIcon}
            title="Couldn't load sessions"
            description="The identity service isn't reachable yet. Try again once E02 is running."
          />
        ) : (
          <div className="space-y-2">
            {(sessionsQuery.data ?? []).map((session) => (
              <div
                key={session.id}
                className="border-border flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <MonitorIcon className="text-fg-muted h-4 w-4" />
                  <div>
                    <p className="text-fg text-sm">
                      {session.device}
                      {session.current && (
                        <span className="text-fg-muted ml-2 text-xs">
                          (this device)
                        </span>
                      )}
                    </p>
                    <p className="text-fg-muted text-xs">
                      {session.ip} ·{' '}
                      {new Date(session.lastActiveAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revokeMutation.mutate(session.id)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            ))}
            {(sessionsQuery.data?.length ?? 0) > 1 && (
              <Button variant="outline" onClick={() => setRevokeAllOpen(true)}>
                Revoke all other sessions
              </Button>
            )}
          </div>
        )}
      </section>

      <Dialog
        open={mfaWizardOpen}
        onOpenChange={(open) => !open && closeMfaWizard()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
          </DialogHeader>
          {!recoveryCodes ? (
            <div className="space-y-4">
              {mfaSetup && (
                <div className="bg-surface-sunken flex justify-center rounded-md p-4">
                  <QRCodeSVG value={mfaSetup.otpauthUri} size={180} />
                </div>
              )}
              <FormField
                label="Enter the 6-digit code"
                htmlFor="mfa-code"
                required
              >
                <Input
                  id="mfa-code"
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputMode="numeric"
                  placeholder="000000"
                />
              </FormField>
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={mfaCode.length !== 6 || enableMutation.isPending}
              >
                {enableMutation.isPending ? 'Verifying…' : 'Verify & enable'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-fg-muted text-sm">
                Save these recovery codes somewhere safe. Each can be used once
                if you lose access to your authenticator.
              </p>
              <CodeBlock code={recoveryCodes.join('\n')} />
              <Button onClick={closeMfaWizard}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField
              label="Enter your current code"
              htmlFor="disable-code"
              required
            >
              <Input
                id="disable-code"
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                inputMode="numeric"
                placeholder="000000"
              />
            </FormField>
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={disableCode.length !== 6 || disableMutation.isPending}
            >
              {disableMutation.isPending ? 'Disabling…' : 'Disable MFA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title="Revoke all other sessions?"
        description="Every other device will be signed out immediately."
        confirmLabel="Revoke all"
        variant="destructive"
        isLoading={revokeAllMutation.isPending}
        onConfirm={() => revokeAllMutation.mutate()}
      />
    </div>
  );
}
