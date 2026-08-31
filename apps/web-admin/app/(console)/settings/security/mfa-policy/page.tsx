'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@verifyng/ui';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { getMfaPolicy, setMfaPolicy } from '@/lib/mfa-policy';

const ROLES = ['owner', 'operator', 'viewer'] as const;

export default function SettingsSecurityMfaPolicyPage() {
  const { activeTenantId } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();

  const policyQuery = useQuery({
    queryKey: ['settings', 'mfa-policy', activeTenantId],
    queryFn: () => getMfaPolicy(tenantPath),
  });

  const [requiredRoles, setRequiredRoles] = useState<string[] | null>(null);
  const [gracePeriodDays, setGracePeriodDays] = useState<number | null>(null);

  const policy = policyQuery.data;
  const roles = requiredRoles ?? policy?.requiredRoles ?? [];
  const grace = gracePeriodDays ?? policy?.gracePeriodDays ?? 7;

  const saveMutation = useMutation({
    mutationFn: () =>
      setMfaPolicy(tenantPath, {
        requiredRoles: roles,
        gracePeriodDays: grace,
      }),
    onSuccess: () => {
      setRequiredRoles(null);
      setGracePeriodDays(null);
      queryClient.invalidateQueries({ queryKey: ['settings', 'mfa-policy'] });
    },
  });

  function toggleRole(role: string) {
    const next = roles.includes(role)
      ? roles.filter((r) => r !== role)
      : [...roles, role];
    setRequiredRoles(next);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-fg text-lg font-semibold">
          Two-factor authentication policy
        </h2>
        <p className="text-fg-muted text-sm">
          Require two-factor authentication for specific roles in this
          organisation. Members who aren&apos;t enrolled yet get a grace period
          before they&apos;re locked out.
        </p>
      </div>

      <FormField label="Roles required to enrol">
        <div className="space-y-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={roles.includes(role)}
                onCheckedChange={() => toggleRole(role)}
              />
              <span className="capitalize">{role}</span>
            </label>
          ))}
        </div>
      </FormField>

      <FormField
        label="Grace period (days)"
        htmlFor="gracePeriodDays"
        description="How long an existing, un-enrolled member has after this policy takes effect."
      >
        <Input
          id="gracePeriodDays"
          type="number"
          min={0}
          value={grace}
          onChange={(e) => setGracePeriodDays(Number(e.target.value))}
        />
      </FormField>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Saving…' : 'Save'}
      </Button>

      <section className="space-y-3 border-t pt-6">
        <h3 className="text-fg text-base font-semibold">
          Members not yet enrolled
        </h3>
        {policy?.affectedMembers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Days remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policy.affectedMembers.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell className="capitalize">{m.role}</TableCell>
                  <TableCell>{m.daysRemaining}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="Everyone is enrolled"
            description="No members required by this policy are missing two-factor authentication."
          />
        )}
      </section>
    </div>
  );
}
