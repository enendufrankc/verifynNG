'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  FormField,
  Input,
  PageHeader,
  Textarea,
  useToast,
} from '@verifyng/ui';
import { useAuthStore } from '@/lib/auth-store';
import { ApiError } from '@/lib/api-client';
import { createHelpTicket } from '@/lib/support';

function HelpForm() {
  const params = useSearchParams();
  const { toast } = useToast();
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const pageUrl = params.get('pageUrl') ?? undefined;
  const module = params.get('module') ?? undefined;

  const mutation = useMutation({
    mutationFn: () =>
      createHelpTicket(activeTenantId!, { subject, body, pageUrl }),
    onSuccess: (ticket) => {
      toast({ title: `Ticket #${ticket.number} created` });
      setSubject('');
      setBody('');
    },
    onError: (err: unknown) =>
      toast({
        title: err instanceof ApiError ? err.message : 'Could not submit',
        variant: 'destructive',
      }),
  });

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        title="Get help"
        description="Send a message to platform support — we'll reply here and by email."
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {pageUrl && (
          <p className="text-fg-muted text-xs">
            Sent from {module ? `${module} — ` : ''}
            {pageUrl}
          </p>
        )}
        <FormField label="Subject" htmlFor="help-subject" required>
          <Input
            id="help-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </FormField>
        <FormField label="How can we help?" htmlFor="help-body" required>
          <Textarea
            id="help-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </FormField>
        <Button type="submit" disabled={mutation.isPending}>
          Send
        </Button>
      </form>
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <HelpForm />
    </Suspense>
  );
}
