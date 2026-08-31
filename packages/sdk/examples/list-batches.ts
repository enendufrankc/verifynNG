/**
 * AC5: `createClient({ apiKey, baseUrl: 'http://localhost:4000' }).batches.list()`
 * returns typed data. Run against a compose stack with a real key:
 *
 *   VERIFYNG_API_KEY=vk_live_... tsx packages/sdk/examples/list-batches.ts
 */
import { createClient } from '../src/index.js';

async function main() {
  const client = createClient({
    apiKey: process.env.VERIFYNG_API_KEY ?? 'vk_live_placeholder',
    baseUrl: process.env.VERIFYNG_BASE_URL ?? 'http://localhost:4000',
  });

  const page = await client.batches.list({ limit: 10 });
  for (const batch of page.data) {
    console.log(batch.id, batch.status, batch.count);
  }
  console.log('nextCursor:', page.nextCursor);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
