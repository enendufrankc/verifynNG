/**
 * `pnpm --filter api cli support:simulate-inbound --from x@y.com --subject "…"`
 *
 * Sends a real email over SMTP to Mailpit (so the message is visible in
 * Mailpit's UI exactly like any other inbound mail would be), then POSTs the
 * same payload to the running API's dev-only simulate-inbound endpoint —
 * see dev-simulate-inbound.controller.ts's comment for why this calls the
 * already-running API over HTTP rather than bootstrapping the full
 * AppModule in-process: doing that pulled in @react-pdf/renderer's
 * dependency graph, and a transitive dependency of that (completely
 * unrelated to support tooling) fails to resolve under tsx's strict ESM
 * resolution (`ERR_PACKAGE_PATH_NOT_EXPORTED` on
 * @react-pdf/hyphenate/package.json's ./en-us subpath) — a real bug hit
 * while actually running this command, not a hypothetical one.
 *
 * This is also the stand-in for E14's own Mailpit-polling emitter, which
 * doesn't exist yet (see CROSS-EPIC-REQUESTS.md "To E14 Notifications" —
 * mail.inbound is still unchecked). Once E14 ships that, this command can
 * just send the SMTP message and let E14's listener take it from there.
 */
import { loadEnv } from '@verifynng/config';
import * as nodemailer from 'nodemailer';

interface Args {
  from: string;
  subject: string;
  text: string;
  inReplyTo?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    from: get('--from', 'dealer@example.com')!,
    subject: get('--subject', 'Codes not scanning')!,
    text: get('--text', "Hi, I can't get any of the tier-2 codes to scan.")!,
    inReplyTo: get('--in-reply-to'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const inboundAddress = env.SUPPORT_INBOUND_ADDRESS;
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? env.NEXT_PUBLIC_API_URL;

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  const result = await transporter.sendMail({
    from: args.from,
    to: inboundAddress,
    subject: args.subject,
    text: args.text,
    inReplyTo: args.inReplyTo,
  });

  const res = await fetch(`${apiBaseUrl}/v1/_dev/support/simulate-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: args.from,
      subject: args.subject,
      text: args.text,
      messageId: result.messageId,
      inReplyTo: args.inReplyTo,
    }),
  });

  if (!res.ok) {
    console.error(`API returned ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const ticket = (await res.json()) as { number: number; status: string };

  console.log(
    `Sent "${args.subject}" from ${args.from} to ${inboundAddress} (messageId=${result.messageId}).`,
  );
  console.log(`Ticket #${ticket.number} (status=${ticket.status}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
