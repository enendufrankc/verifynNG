# Webhooks consumer guide

How to receive and verify VerifyNG webhook deliveries. Applies to every
endpoint you register under **Webhooks** in the console (or via
`POST /api/v1/webhook-endpoints` — see `docs/epics/E16-public-api-webhooks.md`
and [`/api/docs`](/api/docs) for the full API reference).

## Wire format

Every delivery is an HTTP `POST` to the URL you registered:

```
POST <your endpoint URL>
Content-Type: application/json
X-VerifyNG-Event: unit.flagged
X-VerifyNG-Delivery: cly3k9q4x0001abcd1234efgh
X-VerifyNG-Timestamp: 1724800000
X-VerifyNG-Signature: v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd

{
  "id": "cly3k9q4x0001abcd1234efgh",
  "type": "unit.flagged",
  "createdAt": "2026-09-01T10:15:00.000Z",
  "tenantId": "cly1a2b3c0000abcd5678wxyz",
  "apiVersion": "2026-09-01",
  "data": { "unitId": "…", "batchId": "…", "reason": "consumer-report" }
}
```

`X-VerifyNG-Delivery` always equals the body's `id` field — use it for
idempotency (below). `X-VerifyNG-Event` always equals `type`.

Respond with any `2xx` status within **10 seconds** to acknowledge the
delivery. Anything else — a non-2xx status, a timeout, or a connection
error — is treated as a failed attempt and retried (see Retries below).
Your response body is not read; return as soon as you've durably queued
the event for processing, don't do the real work synchronously in the
request handler.

## Verifying the signature

`X-VerifyNG-Signature` is `v1=<hex HMAC-SHA256(secret, "${timestamp}.${rawBody}")>`,
computed over the **exact raw request body bytes** — parse the JSON only
after verifying, and use the timestamp header's raw string value, not a
re-serialized one. `secret` is the `whsec_…` value shown once when you
create or rotate the endpoint.

Always check `X-VerifyNG-Timestamp` is within **5 minutes** of your
server's clock, in both directions — this guide's sample code does this
for you. Reject anything older or further in the future than that,
independent of the signature's validity; it stops a captured request from
being replayed indefinitely even if it once had a valid signature.

### Node.js

```js
const crypto = require('crypto');

function verifyVerifyNGSignature(
  secret,
  rawBody,
  timestampHeader,
  signatureHeader,
) {
  const timestamp = Number(timestampHeader);
  const skew = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (!Number.isFinite(timestamp) || skew > 5 * 60) return false;

  if (!signatureHeader || !signatureHeader.startsWith('v1=')) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest('hex');
  const given = signatureHeader.slice(3);

  return (
    given.length === expected.length &&
    crypto.timingSafeEqual(
      Buffer.from(given, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  );
}

// Express example — express.raw() gives you the exact bytes signed.
app.post(
  '/webhooks/verifyng',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const ok = verifyVerifyNGSignature(
      process.env.VERIFYNG_WEBHOOK_SECRET,
      req.body, // Buffer — toString() is fine, HMAC works on either
      req.header('X-VerifyNG-Timestamp'),
      req.header('X-VerifyNG-Signature'),
    );
    if (!ok) return res.status(401).end();

    const event = JSON.parse(req.body);
    // ... queue `event` for processing, keyed by req.header('X-VerifyNG-Delivery') ...
    res.status(200).end();
  },
);
```

### Python

```python
import hashlib
import hmac
import time

def verify_verifyng_signature(secret: str, raw_body: bytes, timestamp_header: str, signature_header: str) -> bool:
    try:
        timestamp = int(timestamp_header)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - timestamp) > 5 * 60:
        return False

    if not signature_header or not signature_header.startswith("v1="):
        return False
    signed_payload = f"{timestamp_header}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    given = signature_header[3:]

    return hmac.compare_digest(given, expected)

# Flask example
@app.route("/webhooks/verifyng", methods=["POST"])
def verifyng_webhook():
    ok = verify_verifyng_signature(
        os.environ["VERIFYNG_WEBHOOK_SECRET"],
        request.get_data(),  # raw bytes, before Flask parses JSON
        request.headers.get("X-VerifyNG-Timestamp", ""),
        request.headers.get("X-VerifyNG-Signature", ""),
    )
    if not ok:
        return "", 401

    event = request.get_json()
    # ... queue `event` for processing, keyed by request.headers["X-VerifyNG-Delivery"] ...
    return "", 200
```

### PHP

```php
<?php

function verify_verifyng_signature(string $secret, string $rawBody, ?string $timestampHeader, ?string $signatureHeader): bool
{
    if ($timestampHeader === null || !ctype_digit($timestampHeader)) {
        return false;
    }
    if (abs(time() - (int) $timestampHeader) > 5 * 60) {
        return false;
    }

    if ($signatureHeader === null || !str_starts_with($signatureHeader, 'v1=')) {
        return false;
    }
    $expected = hash_hmac('sha256', "{$timestampHeader}.{$rawBody}", $secret);
    $given = substr($signatureHeader, 3);

    return hash_equals($expected, $given);
}

// Plain PHP example — file_get_contents('php://input') gives the raw bytes.
$rawBody = file_get_contents('php://input');
$ok = verify_verifyng_signature(
    getenv('VERIFYNG_WEBHOOK_SECRET'),
    $rawBody,
    $_SERVER['HTTP_X_VERIFYNG_TIMESTAMP'] ?? null,
    $_SERVER['HTTP_X_VERIFYNG_SIGNATURE'] ?? null,
);
if (!$ok) {
    http_response_code(401);
    exit;
}

$event = json_decode($rawBody, true);
// ... queue $event for processing, keyed by $_SERVER['HTTP_X_VERIFYNG_DELIVERY'] ...
http_response_code(200);
```

## Idempotency

Retries and manual redeliveries can send the **same** `X-VerifyNG-Delivery`
value more than once. Treat it as an idempotency key: store the ids you've
already processed (a database unique constraint or a short-TTL cache both
work) and skip reprocessing on a repeat, before doing anything with side
effects. The event `id` field in the body is the same value — use whichever
is more convenient in your stack.

## Retries

A failed attempt (non-2xx, timeout, or connection error) is retried with
exponential backoff and jitter: `min(24h, 30s × 2^attempts)`, roughly
1 min, 2 min, 4 min, 8 min, … up to a 24-hour cap, for up to **10 attempts**
total. After the 10th failed attempt the delivery is marked `dead` and
stops retrying automatically — reissue it yourself with **Redeliver** in
the console delivery log (or `POST /v1/tenants/:tenantId/webhook-deliveries/:id/redeliver`
if you're calling the console API directly; this route isn't part of the
key-authenticated public API). An endpoint that racks up 50 consecutive
dead-lettered deliveries is automatically disabled — re-enable it once
your receiver is healthy again.

## IP allow-list

VerifyNG does not currently publish a fixed set of source IP addresses for
webhook deliveries, so IP-based allow-listing is not a reliable control —
don't rely on it as your only authentication mechanism. HMAC signature
verification (above) is the supported way to authenticate a delivery as
genuinely from VerifyNG.

## Event catalogue

`data` below is the value of the envelope's `data` field for that event
type; the envelope itself (`id`/`type`/`createdAt`/`tenantId`/`apiVersion`)
is the same shape for every event. `ping` is sent only by the console's
**Send test** button and isn't part of any endpoint's `events` selection —
`*` subscribes to every event below except `ping`.

| Event                 | Fires when                                                                             | `data`                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `scan.suspicious`     | A verification scan comes back `suspicious`, `flagged`, or an unrecognised tier-2 code | `{ scanEventId, unitId, batchId, tier, verdict, geo: { country, city } \| null, at }`   |
| `unit.flagged`        | A unit is flagged (by a consumer report, anomaly detection, or manually)               | `{ unitId, batchId, reason }`                                                           |
| `unit.decommissioned` | A unit is decommissioned                                                               | `{ unitId, batchId, reason }`                                                           |
| `anomaly.detected`    | The anomaly engine opens a new anomaly                                                 | `{ anomalyId, rule, score, unitId, batchId, autoFlagged }`                              |
| `batch.minted`        | A batch finishes minting                                                               | `{ batchId, productId, oemId, count }`                                                  |
| `batch.printed`       | An OEM confirms receipt of a batch's print manifest                                    | `{ batchId, oemId, codeCount }`                                                         |
| `batch.shipped`       | An OEM marks a batch shipped                                                           | `{ batchId, oemId, shippedAt, expectedArrivalAt }`                                      |
| `report.created`      | A consumer submits a report on a unit                                                  | `{ reportId, reference, unitId, batchId, productId, verdictAtReport, purchaseChannel }` |
| `ping`                | Test-send only                                                                         | `{}`                                                                                    |

Example `unit.flagged` delivery body:

```json
{
  "id": "cly3k9q4x0001abcd1234efgh",
  "type": "unit.flagged",
  "createdAt": "2026-09-01T10:15:00.000Z",
  "tenantId": "cly1a2b3c0000abcd5678wxyz",
  "apiVersion": "2026-09-01",
  "data": {
    "unitId": "cly2f8h9i0004wxyz1234abcd",
    "batchId": "cly2e7g8h0003wxyz1234abcd",
    "reason": "consumer-report"
  }
}
```
