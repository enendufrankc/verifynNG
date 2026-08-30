import type { APIRequestContext } from '@playwright/test';

const MAILPIT_API = process.env.MAILPIT_API_URL ?? 'http://localhost:8025/api';

export interface MailpitMatch {
  id: string;
  /** Every recipient address on the message (Mailpit's `To` is `[{Name, Address}]`, not strings). */
  to: string[];
  subject: string;
}

export interface WaitForEmailOptions {
  /** Only match a message addressed to this recipient (case-insensitive). */
  to?: string;
  timeoutMs?: number;
}

/**
 * Wait for an email matching the subject (and, optionally, a recipient) to
 * appear in Mailpit. Polls every 500ms.
 */
export async function waitForEmail(
  request: APIRequestContext,
  subject: string,
  opts: WaitForEmailOptions = {},
): Promise<MailpitMatch> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await request.get(`${MAILPIT_API}/v1/messages`);
    if (resp.ok()) {
      const data = await resp.json();
      const messages = (data.messages ?? []) as Array<{
        ID: string;
        Subject?: string;
        To?: Array<{ Address: string }>;
      }>;
      const match = messages.find((m) => {
        if (!m.Subject?.includes(subject)) return false;
        if (!opts.to) return true;
        return m.To?.some(
          (t) => t.Address.toLowerCase() === opts.to!.toLowerCase(),
        );
      });
      if (match) {
        return {
          id: match.ID,
          to: (match.To ?? []).map((t) => t.Address),
          subject: match.Subject ?? '',
        };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Email with subject "${subject}"${opts.to ? ` to "${opts.to}"` : ''} not found within ${timeoutMs}ms`,
  );
}

export const mailpit = { waitFor: waitForEmail };
