import type { APIRequestContext } from '@playwright/test';

const MAILPIT_API = process.env.MAILPIT_API_URL ?? 'http://localhost:8025/api';

/**
 * Wait for an email matching the subject to appear in Mailpit.
 * Polls every 500ms for up to 10s.
 */
export async function waitForEmail(
  request: APIRequestContext,
  subject: string,
  timeoutMs = 10_000,
): Promise<{ id: string; to: string; subject: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await request.get(`${MAILPIT_API}/v1/messages`);
    if (resp.ok()) {
      const data = await resp.json();
      const match = data.messages?.find((m: { Subject?: string }) =>
        m.Subject?.includes(subject),
      );
      if (match) {
        return {
          id: match.ID,
          to: match.To?.[0] ?? '',
          subject: match.Subject,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Email with subject "${subject}" not found within ${timeoutMs}ms`,
  );
}

export const mailpit = { waitFor: waitForEmail };
