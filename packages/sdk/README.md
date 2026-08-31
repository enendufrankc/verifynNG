# @verifynng/sdk

TypeScript client for the verifynNG public API (`/api/v1/**`) and a
webhook-signature verifier — generated from the committed
[`openapi.json`](./openapi.json) (see `docs/epics/E16-public-api-webhooks.md`).

This SDK targets Node (it uses `node:crypto` for webhook signature
verification and Idempotency-Key generation) — it's meant for your backend
ERP/integration service, not a browser bundle.

## Quick start

```ts
import { createClient } from '@verifynng/sdk';

const client = createClient({
  apiKey: process.env.VERIFYNG_API_KEY!, // vk_live_… or vk_test_…
  baseUrl: 'https://api.your-verifynng-tenant.example', // http://localhost:4000 in compose
});

const { data: batches, nextCursor } = await client.batches.list({ limit: 20 });

// Or walk every page automatically:
for await (const batch of client.batches.listAll()) {
  console.log(batch.id, batch.status);
}

// Idempotency-Key is generated for you if you don't pass one:
const { batch } = await client.batches.create({
  productId: 'prod_123',
  oemId: 'oem_123',
  count: 1000,
});

await client.units.flag(unitId, { reason: 'suspicious scan pattern' });
```

Every non-2xx response throws `VerifyNGApiError` — `error.status` and
`error.body.type` match the API's error envelope (`not_found`, `validation`,
`rate_limited`, …).

## Verifying webhook signatures

See `docs/webhooks-consumer-guide.md` for the full write-up (Node, Python,
PHP samples). In Node:

```ts
import { verifyWebhookSignature } from '@verifynng/sdk';

app.post(
  '/webhooks/verifyng',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const rawBody = req.body.toString('utf8'); // must be the exact bytes received
    const ok = verifyWebhookSignature(
      process.env.WEBHOOK_SECRET!,
      req.headers,
      rawBody,
    );
    if (!ok) return res.status(400).send('invalid signature');

    const event = JSON.parse(rawBody);
    // ... handle event.type
    res.sendStatus(200);
  },
);
```

## Regenerating types

`src/types.gen.ts` is generated from `openapi.json` — do not hand-edit it.

```
pnpm --filter @verifynng/sdk types:generate
```

`openapi.json` itself is generated from the API's decorators — see
`pnpm api:openapi:generate` / `pnpm api:openapi:check` at the repo root.
