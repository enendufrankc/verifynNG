/**
 * Generic CLI dispatcher — `pnpm --filter api cli <command> [...args]`.
 * Add a case per command as they're needed; each command owns its own args.
 */
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
