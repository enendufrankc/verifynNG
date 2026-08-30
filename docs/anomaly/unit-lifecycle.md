# Unit lifecycle

`UnitLifecycleService` (`apps/api/src/modules/units/unit-lifecycle.service.ts`)
is the **sole writer** of `Unit.state`. E06 only reads it to pick the verify
verdict; E04 never mutates it. Every transition is recorded as a
`UnitStateTransition` row and emitted as a domain event; a transition
outside the state machine below is rejected with `409`, not silently
ignored.

```
active ──flag(operator|system)────────► flagged ──restore(owner)──────► active
  │                                        │
  └──decommission(owner|recall)────────────┴──decommission(owner|recall)──► decommissioned ──restore(owner, reason required)──► active
```

| Transition     | From                        | To               | Who                                          | Notes                                                              |
| -------------- | --------------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `flag`         | `active`                    | `flagged`        | `operator`\|`owner`, or `system` (auto-flag) |                                                                    |
| `decommission` | `active`, `flagged`         | `decommissioned` | `owner`, or `system` (recall job)            |                                                                    |
| `restore`      | `flagged`, `decommissioned` | `active`         | `owner`                                      | reason always required (DTO), not just for the decommissioned case |

Every route requires a `reason` string; it's stored on the
`UnitStateTransition` row and (for HTTP-triggered actions) on the
`@Audited` audit-log entry via `AuditInterceptor`. System-triggered
transitions (engine auto-flag, recall job) have no HTTP request to
decorate, so `UnitLifecycleService` records its own audit row for those —
except during a batch recall, where the _single_ audit row already written
by `POST /v1/batches/:id/recall`'s own `@Audited('batch.recall')` covers the
whole action; per-unit transitions during a recall pass `skipAudit: true`.

## Consumer effect (E06)

E06 reads `Unit.state` when computing the verify verdict:

- `flagged` → amber verdict, caution copy.
- `decommissioned` → red verdict, "withdrawn by the brand" copy.

E07 only changes the state; the verdict copy itself is E06's.

## Batch recall

`POST /v1/batches/:id/recall` (owner-only) enqueues a BullMQ `recall` job on
the `units` queue and returns `{ jobId }` immediately; `RecallProcessor`
pages through the batch's `active`/`flagged` units (500 at a time),
decommissioning each one through the same `UnitLifecycleService.decommission`
path (so `restore` remains possible per unit afterwards — there is
deliberately no bulk restore), tagging each `UnitStateTransition` with the
job's id via `recallJobId`. Progress is polled at
`GET /v1/batches/:id/recall/:jobId`. The job emits one `batch.recalled`
event with the total count when done; per-unit `unit.decommissioned` events
still fire for each unit (carrying `recallJobId`) for anyone consuming that
event stream directly.
