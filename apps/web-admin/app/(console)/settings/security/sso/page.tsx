'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@verifyng/ui';
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import {
  disableSso,
  getSsoConfig,
  testSsoConnection,
  upsertSsoConfig,
  type UpsertSsoConfigInput,
} from '@/lib/sso';
import { ApiError } from '@/lib/api-client';

export default function SettingsSecuritySsoPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['settings', 'sso', activeTenantId],
    queryFn: () => getSsoConfig(tenantPath),
  });

  const [provider, setProvider] =
    useState<UpsertSsoConfigInput['provider']>('fake');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [issuer, setIssuer] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const [jitProvisioning, setJitProvisioning] = useState(false);
  const [jitDefaultRole, setJitDefaultRole] =
    useState<UpsertSsoConfigInput['jitDefaultRole']>('viewer');
  const [enforceConfirmOpen, setEnforceConfirmOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [unmetPreconditions, setUnmetPreconditions] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');

  const config = configQuery.data;

  if (configQuery.isSuccess && clientId === '' && config?.clientId) {
    // Hydrate the form once, from the loaded config, without fighting user edits.
    setClientId(config.clientId);
    setProvider(config.provider ?? 'fake');
    setIssuer(config.issuer ?? '');
    setDomains(config.allowedDomains ?? []);
    setJitProvisioning(config.jitProvisioning ?? false);
    setJitDefaultRole(
      (config.jitDefaultRole as 'viewer' | 'operator') ?? 'viewer',
    );
  }

  function buildInput(enforceSso: boolean): UpsertSsoConfigInput {
    return {
      provider,
      clientId,
      clientSecret: clientSecret || undefined,
      issuer: issuer || undefined,
      allowedDomains: domains,
      jitProvisioning,
      jitDefaultRole,
      enforceSso,
    };
  }

  const saveMutation = useMutation({
    mutationFn: (enforceSso: boolean) =>
      upsertSsoConfig(tenantPath, buildInput(enforceSso)),
    onSuccess: () => {
      setSaveError('');
      setUnmetPreconditions([]);
      setClientSecret('');
      setEnforceConfirmOpen(false);
      setConfirmSlug('');
      queryClient.invalidateQueries({ queryKey: ['settings', 'sso'] });
    },
    onError: (error: unknown) => {
      if (
        error instanceof ApiError &&
        error.code === 'enforce_sso_preconditions_unmet' &&
        Array.isArray(error.payload?.unmet)
      ) {
        setUnmetPreconditions(error.payload.unmet as string[]);
        return;
      }
      setSaveError(error instanceof Error ? error.message : 'Save failed');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testSsoConnection(tenantPath),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableSso(tenantPath),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['settings', 'sso'] }),
  });

  function addDomain() {
    const d = domainInput.trim().toLowerCase();
    if (d && !domains.includes(d)) setDomains([...domains, d]);
    setDomainInput('');
  }

  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-fg text-lg font-semibold">Single sign-on</h2>
          <p className="text-fg-muted text-sm">
            Let your team sign in with a Google or Microsoft work account.
          </p>
        </div>

        {saveError && (
          <div
            className="bg-v-flag-tint text-v-flag rounded-md p-3 text-sm"
            role="alert"
          >
            {saveError}
          </div>
        )}

        <FormField label="Provider" htmlFor="provider">
          <Select
            value={provider}
            onValueChange={(v) =>
              setProvider(v as UpsertSsoConfigInput['provider'])
            }
          >
            <SelectTrigger id="provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="microsoft">Microsoft Entra ID</SelectItem>
              <SelectItem value="fake">Fake (local testing only)</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Client ID" htmlFor="clientId" required>
          <Input
            id="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </FormField>

        <FormField
          label="Client secret"
          htmlFor="clientSecret"
          description={
            config?.clientSecretLast4
              ? `Currently set — ends in ${config.clientSecretLast4}. Leave blank to keep it.`
              : undefined
          }
        >
          <Input
            id="clientSecret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={config?.clientSecretLast4 ? '••••••••' : ''}
          />
        </FormField>

        {(provider === 'fake' || provider === 'microsoft') && (
          <FormField
            label="Issuer"
            htmlFor="issuer"
            description={
              provider === 'microsoft'
                ? 'https://login.microsoftonline.com/<tenant-id>/v2.0'
                : 'http://localhost:4104/default (fake-oidc)'
            }
          >
            <Input
              id="issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            />
          </FormField>
        )}

        <FormField label="Allowed domains" htmlFor="domain">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {domains.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button
                    type="button"
                    aria-label={`Remove ${d}`}
                    onClick={() => setDomains(domains.filter((x) => x !== d))}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="yourcompany.com"
              />
              <Button type="button" variant="outline" onClick={addDomain}>
                Add
              </Button>
            </div>
          </div>
        </FormField>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-fg text-sm">Just-in-time provisioning</p>
            <p className="text-fg-muted text-sm">
              Automatically add new members from an allowed domain.
            </p>
          </div>
          <Switch
            checked={jitProvisioning}
            onCheckedChange={setJitProvisioning}
          />
        </div>

        {jitProvisioning && (
          <FormField label="Default role for new members" htmlFor="jitRole">
            <Select
              value={jitDefaultRole}
              onValueChange={(v) =>
                setJitDefaultRole(v as 'viewer' | 'operator')
              }
            >
              <SelectTrigger id="jitRole">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="operator">Operator</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => saveMutation.mutate(config?.enforceSso ?? false)}
            disabled={saveMutation.isPending || !clientId}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !config?.enabled}
          >
            {testMutation.isPending ? 'Testing…' : 'Test connection'}
          </Button>
          {config?.enabled && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
            >
              Disable
            </Button>
          )}
        </div>

        {testMutation.data && (
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
              testMutation.data.ok ? 'border-green-600/30' : 'border-v-flag/30'
            }`}
          >
            {testMutation.data.ok ? (
              <CheckCircle2Icon className="mt-0.5 h-4 w-4 text-green-600" />
            ) : (
              <XCircleIcon className="text-v-flag mt-0.5 h-4 w-4" />
            )}
            <div>
              {testMutation.data.ok ? (
                <>
                  <p>Discovery succeeded.</p>
                  <p className="text-fg-muted text-xs">
                    issuer: {testMutation.data.issuer}
                  </p>
                  <p className="text-fg-muted text-xs">
                    authorization_endpoint:{' '}
                    {testMutation.data.authorizationEndpoint}
                  </p>
                </>
              ) : (
                <p>{testMutation.data.error}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-fg text-base font-semibold">Enforce SSO</h3>
            <p className="text-fg-muted text-sm">
              Disable password sign-in entirely for this organisation. Owners
              keep emergency access via password + authenticator code.
            </p>
          </div>
          <Switch
            checked={config?.enforceSso ?? false}
            onCheckedChange={(checked) => {
              if (checked) {
                setUnmetPreconditions([]);
                setEnforceConfirmOpen(true);
              } else {
                saveMutation.mutate(false);
              }
            }}
          />
        </div>
      </section>

      {!config?.enabled && !configQuery.isLoading && (
        <EmptyState
          title="No SSO configured"
          description="Fill in the form above and save to get started."
        />
      )}

      <Dialog open={enforceConfirmOpen} onOpenChange={setEnforceConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enforce SSO for this organisation?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-fg-muted text-sm">
              Password sign-in will be disabled for everyone except owners (via
              emergency access). Type the organisation slug to confirm.
            </p>
            {unmetPreconditions.length > 0 && (
              <div className="bg-v-flag-tint text-v-flag space-y-1 rounded-md p-3 text-sm">
                <p className="flex items-center gap-1 font-medium">
                  <AlertTriangleIcon className="h-4 w-4" /> Can&apos;t enforce
                  SSO yet
                </p>
                <ul className="list-disc pl-5">
                  {unmetPreconditions.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            <Input
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              placeholder={activeTenantId ?? ''}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEnforceConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                confirmSlug !== activeTenantId || saveMutation.isPending
              }
              onClick={() => saveMutation.mutate(true)}
            >
              {saveMutation.isPending ? 'Enforcing…' : 'Enforce SSO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
