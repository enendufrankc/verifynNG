/**
 * `pnpm --filter api cli support:simulate-inbound --from x@y.com --subject "…" [--text "…"]`
 *
 * Sends a real email over SMTP to Mailpit (so the message is visible in
 * Mailpit's UI exactly like any other inbound mail would be) and then feeds
 * the same message through the `mail.inbound` event — this is the stand-in
 * for E14's own Mailpit-polling emitter, which doesn't exist yet (see
 * CROSS-EPIC-REQUESTS.md "To E14 Notifications" — mail.inbound is still
 * unchecked). Once E14 ships that, this command can just send the SMTP
 * message and let E14's listener take it from there.
 */
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';
import { AppModule } from '../../../app.module';

interface Args {
  from: string;
  subject: string;
  text: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    from: get('--from', 'dealer@example.com'),
    subject: get('--subject', 'Codes not scanning'),
    text: get('--text', "Hi, I can't get any of the tier-2 codes to scan."),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const config = app.get(ConfigService);
  const eventEmitter = app.get(EventEmitter2);

  const inboundAddress = config.get<string>(
    'SUPPORT_INBOUND_ADDRESS',
    'support@verifyng.local',
  );

  const transporter = nodemailer.createTransport({
    host: config.get('SMTP_HOST'),
    port: Number(config.get('SMTP_PORT')),
    secure: false,
  });

  const result = await transporter.sendMail({
    from: args.from,
    to: inboundAddress,
    subject: args.subject,
    text: args.text,
  });

  eventEmitter.emit('mail.inbound', {
    from: args.from,
    to: inboundAddress,
    subject: args.subject,
    text: args.text,
    messageId: result.messageId,
    inReplyTo: undefined,
  });

  console.log(
    `Sent "${args.subject}" from ${args.from} to ${inboundAddress} (messageId=${result.messageId}) and emitted mail.inbound.`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
