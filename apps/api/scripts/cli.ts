/**
 * Generic CLI dispatcher — `pnpm --filter api cli <command> [...args]`.
 * Add a case per command as they're needed; each command owns its own args.
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

// Per-worktree overrides first (.env, written by scripts/epic start), then
// repo defaults — same precedence as packages/db/scripts/prisma-with-env.cjs.
// Without this, commands using @verifynng/config's loadEnv() (which only
// reads process.env, it never sources .env itself) silently fall back to
// every zod schema default — found the hard way running this exact command:
// SMTP_PORT resolved to the schema's default 1025 instead of this
// worktree's actual offset Mailpit port, and the connection just refused.
loadDotenv({ path: resolve(__dirname, '../../../.env') });
loadDotenv({ path: resolve(__dirname, '../../../.env.example') });

const command = process.argv[2];
const rest = process.argv.slice(3);

async function main() {
  switch (command) {
    case 'support:simulate-inbound': {
      process.argv = [process.argv[0], process.argv[1], ...rest];
      await import('../src/modules/support/mail/simulate-inbound.command.js');
      break;
    }
    default:
      console.error(
        `Unknown cli command: ${command ?? '(none)'}\nAvailable: support:simulate-inbound`,
      );
      process.exit(1);
  }
}

main();
