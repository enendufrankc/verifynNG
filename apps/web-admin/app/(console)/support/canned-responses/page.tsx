'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { MessageSquareText, Plus } from 'lucide-react';
import { queryKeys } from '@/lib/query';
import { ApiError } from '@/lib/api-client';
import {
  createCannedResponse,
  deleteCannedResponse,
  listCannedResponses,
  updateCannedResponse,
  type CannedResponse,
} from '@/lib/support';

export default function CannedResponsesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [form, setForm] = useState({ slug: '', title: '', body: '' });

  const query = useQuery({
    queryKey: queryKeys.support.cannedResponses(),
    queryFn: listCannedResponses,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.support.cannedResponses(),
    });

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? updateCannedResponse(editing.id, {
            title: form.title,
            body: form.body,
          })
        : createCannedResponse(form),
    onSuccess: () => {
      setOpen(false);
      setEditing(null);
      setForm({ slug: '', title: '', body: '' });
      invalidate();
    },
    onError: (err: unknown) =>
      toast({
        title: err instanceof ApiError ? err.message : 'Could not save',
        variant: 'destructive',
      }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteCannedResponse(id),
    onSuccess: invalidate,
  });

  const openEdit = (response: CannedResponse) => {
    setEditing(response);
    setForm({
      slug: response.slug,
      title: response.title,
      body: response.body,
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ slug: '', title: '', body: '' });
    setOpen(true);
  };

  const columns: ColumnDef<CannedResponse>[] = [
    { accessorKey: 'title', header: 'Title' },
    { accessorKey: 'slug', header: 'Slug' },
    {
      accessorKey: 'body',
      header: 'Preview',
      cell: ({ row }) => (
        <span className="text-fg-muted line-clamp-1">{row.original.body}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Canned responses"
        description="Reusable reply templates with {{requesterName}}, {{tenantName}}, {{ticketNumber}}."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={query.data ?? []}
        isLoading={query.isLoading}
        emptyState={
          <EmptyState icon={MessageSquareText} title="No canned responses" />
        }
        rowActions={(response) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEdit(response)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeMutation.mutate(response.id)}
            >
              Delete
            </Button>
          </div>
        )}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit' : 'New'} canned response
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <FormField label="Slug" htmlFor="cr-slug" required>
                <Input
                  id="cr-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                />
              </FormField>
            )}
            <FormField label="Title" htmlFor="cr-title" required>
              <Input
                id="cr-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </FormField>
            <FormField label="Body" htmlFor="cr-body" required>
              <Textarea
                id="cr-body"
                rows={5}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
