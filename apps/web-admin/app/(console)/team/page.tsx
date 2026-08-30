'use client';

import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@verifyng/ui';
import { UsersIcon, UserPlusIcon, AlertTriangleIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useTenantPath } from '@/lib/tenant-path';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import { Form, setServerErrors, useZodForm } from '@/lib/forms';
import {
  inviteMember,
  listMembers,
  removeMember,
  updateMemberRole,
  type MemberRole,
  type TenantMember,
} from '@/lib/members';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['owner', 'operator', 'viewer']),
});
type InviteInput = z.infer<typeof inviteSchema>;

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Owner',
  operator: 'Operator',
  viewer: 'Viewer',
};

export default function TeamPage() {
  const { activeTenantId, role } = useAuth();
  const tenantPath = useTenantPath();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isOwner = role === 'owner';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<TenantMember | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.team.list(activeTenantId ?? ''),
    queryFn: () => listMembers(tenantPath),
    enabled: !!activeTenantId,
  });

  const inviteForm = useZodForm<InviteInput>(inviteSchema, {
    email: '',
    role: 'viewer',
  });

  const inviteMutation = useMutation({
    mutationFn: (input: InviteInput) => inviteMember(tenantPath, input),
    onSuccess: () => {
      toast({ title: 'Invitation sent' });
      setInviteOpen(false);
      inviteForm.reset();
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      setServerErrors(inviteForm, error);
      if (error instanceof ApiError && !error.details?.length) {
        toast({ title: error.message, variant: 'destructive' });
      }
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      updateMemberRole(tenantPath, userId, role),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      }),
    onError: (error: unknown) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Role change failed',
        variant: 'destructive',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(tenantPath, userId),
    onSuccess: () => {
      setRemoveTarget(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.team.list(activeTenantId ?? ''),
      });
    },
    onError: (error: unknown) => {
      toast({
        title:
          error instanceof ApiError ? error.message : 'Could not remove member',
        variant: 'destructive',
      });
    },
  });

  const columns: ColumnDef<TenantMember>[] = [
    { accessorKey: 'displayName', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const member = row.original;
        if (!isOwner)
          return <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>;
        return (
          <Select
            value={member.role}
            onValueChange={(value) =>
              roleMutation.mutate({
                userId: member.userId,
                role: value as MemberRole,
              })
            }
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        );
      },
    },
    {
      accessorKey: 'joinedAt',
      header: 'Joined',
      cell: ({ row }) => new Date(row.original.joinedAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Members of your organization and their roles."
        actions={
          isOwner ? (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlusIcon className="mr-2 h-4 w-4" />
                  Invite member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a team member</DialogTitle>
                </DialogHeader>
                <Form
                  form={inviteForm}
                  onSubmit={(values) => inviteMutation.mutate(values)}
                  className="space-y-4"
                >
                  <FormField
                    label="Email"
                    htmlFor="invite-email"
                    error={inviteForm.formState.errors.email?.message}
                    required
                  >
                    <Input
                      id="invite-email"
                      type="email"
                      {...inviteForm.register('email')}
                    />
                  </FormField>
                  <FormField label="Role" htmlFor="invite-role" required>
                    <Select
                      defaultValue="viewer"
                      onValueChange={(value) =>
                        inviteForm.setValue('role', value as MemberRole)
                      }
                    >
                      <SelectTrigger id="invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="operator">Operator</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <DialogFooter>
                    <Button type="submit" disabled={inviteMutation.isPending}>
                      {inviteMutation.isPending ? 'Sending…' : 'Send invite'}
                    </Button>
                  </DialogFooter>
                </Form>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {membersQuery.isError ? (
        <EmptyState
          icon={AlertTriangleIcon}
          title="Couldn't load team members"
          description="The identity service isn't reachable yet. Try again once E02 is running."
        />
      ) : (
        <DataTable
          columns={columns}
          data={membersQuery.data ?? []}
          isLoading={membersQuery.isLoading}
          emptyState={<EmptyState icon={UsersIcon} title="No members yet" />}
          rowActions={
            isOwner
              ? (member) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveTarget(member)}
                  >
                    Remove
                  </Button>
                )
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.displayName ?? 'member'}?`}
        description="They'll lose access to this organization immediately."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={() =>
          removeTarget && removeMutation.mutate(removeTarget.userId)
        }
      />
    </div>
  );
}
