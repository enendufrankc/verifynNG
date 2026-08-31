/**
 * General-purpose operator CLI: `pnpm --filter api cli <command> [...args]`.
 * Bootstraps a minimal Nest application context per command family (see
 * BillingCliModule) and exits. Currently one command family: billing.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

process.env.WORKER_INLINE = process.env.WORKER_INLINE ?? 'false';

// Per-worktree overrides first (.env, written by scripts/epic start), then repo defaults.
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../../.env.example') });

import { NestFactory } from '@nestjs/core';
import { prisma } from '@verifynng/db';
import { BillingCliModule } from '../src/modules/billing/billing-cli.module';
import { InvoiceService } from '../src/modules/billing/invoice.service';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command) {
    console.error('usage: cli <command> [...args]');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(BillingCliModule, {
    logger: ['error', 'warn'],
  });

  try {
    switch (command) {
      case 'billing:run-invoices': {
        const tenantSlug = parseArg('tenant');
        const period = parseArg('period');
        if (!tenantSlug || !period) {
          console.error(
            'usage: cli billing:run-invoices --tenant <slug> --period <YYYY-MM>',
          );
          process.exitCode = 1;
          return;
        }
        const tenant = await prisma.tenant.findUniqueOrThrow({
          where: { slug: tenantSlug },
        });
        const invoices = app.get(InvoiceService);
        const invoice = await invoices.generateForPeriod(tenant.id, period);
        const issued = await invoices.issue(invoice.id);
        const full = await invoices.getForTenant(tenant.id, issued.id);
        console.log(JSON.stringify(full));
        break;
      }
      default:
        console.error(`unknown command: ${command}`);
        process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
