# Batch state machine (E05)

E04 mints a batch to `minted`. From there, E05 owns every subsequent
transition, enforced by `BatchLifecycleService.transition()`
(`apps/api/src/modules/oem-manifest/batch-lifecycle.service.ts`) — no other
code path is allowed to write `Batch.status` once a batch has left `minted`.

```
minted ──deliver──► delivered ──receipt ok──► printed ──ship──► shipped ──close──► closed
   │                   │  ▲                       │                  │
   │                   │  └─ resend/revoke (stays delivered)         │
   └──────────────────────────── close ──────────────────────────────┘
                                                                (closed is terminal)

receipt mismatch: stays `delivered`, emits `receipt.mismatch` — no Batch.status change
```

## Legal transitions

| From                                        | To          | Trigger                                                       |
| ------------------------------------------- | ----------- | ------------------------------------------------------------- |
| `minted`                                    | `delivered` | `POST /tenants/:tenantId/batches/:id/deliveries` (owner)      |
| `delivered`                                 | `printed`   | A **matched** receipt (`POST /v1/oem/deliveries/:id/receipt`) |
| `printed`                                   | `shipped`   | `POST /v1/oem/deliveries/:id/ship`                            |
| `minted`, `delivered`, `printed`, `shipped` | `closed`    | `POST /tenants/:tenantId/batches/:id/close` (owner only)      |

Every other `(from, to)` pair — including a same-state no-op like
`shipped → shipped` — is rejected with `409 { error: 'illegal_transition', from, to }`.
`closed` is terminal: nothing transitions out of it, including another close.

A **mismatched** receipt does not transition the batch at all; it stays
`delivered`, records a `PrintReceipt` row with `matched: false`, and emits
`receipt.mismatch` (routed to the tenant owner by E14).

## Why `close` is special

An owner can close a batch from any of `minted | delivered | printed | shipped`
— unlike the rest of the pipeline, `close` isn't a step forward in printing
the batch, it's a decision that the batch is done (or being abandoned) at
whatever stage it's at. It never fires automatically.

## `ManifestDelivery.status` is a separate, finer-grained state

`Batch.status` tracks the _batch's_ lifecycle across the whole platform.
`ManifestDelivery.status` (`delivered → downloaded → receipted`, or
`revoked`/`expired`) tracks _this specific delivery record's_ own lifecycle —
a batch can only have one "live" delivery at a time in practice, but the
distinction matters for `resend` (which reopens a delivery without touching
`Batch.status`) and `revoke` (which kills the delivery outright without
affecting the batch's ability to be delivered again, in principle, to a
different OEM later — see `docs/oem/oem-portal-guide.md`).
