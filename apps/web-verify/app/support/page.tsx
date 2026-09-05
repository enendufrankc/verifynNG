'use client';

import { useState } from 'react';
import { Button, FormField, Input, StatusChip, Textarea } from '@verifyng/ui';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/**
 * Public consumer support form — T8. No tenant context, no auth: anyone who
 * scanned a code and has a question can reach platform support here.
 */
export default function SupportPage() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/public/support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          subject,
          body,
          code: code || undefined,
          captchaToken,
        }),
      });
      if (res.status === 429) {
        setError(
          "You've reached the limit for this hour — please try again later.",
        );
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.message ?? 'Could not submit your message. Please try again.',
        );
        return;
      }
      const data = (await res.json()) as { ticketNumber: number };
      setTicketNumber(data.ticketNumber);
    } catch {
      setError(
        'Could not reach support. Please check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (ticketNumber) {
    return (
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-semibold">Thanks — we got it</h1>
        <p className="text-fg-muted">
          Your reference is <strong>#{ticketNumber}</strong>. We&apos;ll reply
          to {email} shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Contact support</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Have a question about a product, a code that won&apos;t scan, or
          something else? Send us a message.
        </p>
      </div>
      <form className="space-y-4" onSubmit={onSubmit}>
        <FormField label="Email" htmlFor="support-email" required>
          <Input
            id="support-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Subject" htmlFor="support-subject" required>
          <Input
            id="support-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Message" htmlFor="support-body" required>
          <Textarea
            id="support-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </FormField>
        <FormField
          label="Code (optional)"
          htmlFor="support-code"
          description="If your question is about a specific product, paste the code from the label."
        >
          <Input
            id="support-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ivoryglow.2.k1.…"
          />
        </FormField>
        <div>
          {CAPTCHA_SITE_KEY ? (
            <div
              data-testid="turnstile-widget-slot"
              data-sitekey={CAPTCHA_SITE_KEY}
            />
          ) : (
            <div className="space-y-1">
              <StatusChip variant="warning">
                Dev mode — captcha bypass
              </StatusChip>
              <Input
                placeholder="ok-demo (dev captcha token)"
                value={captchaToken}
                onChange={(e) => setCaptchaToken(e.target.value)}
              />
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Sending…' : 'Send message'}
        </Button>
      </form>
    </div>
  );
}
