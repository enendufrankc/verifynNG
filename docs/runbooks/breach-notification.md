# Breach Notification Runbook

For any suspected exposure of personal data — a leaked credential, a misconfigured bucket, an unauthorised access, a vulnerability that was actually exploited. Follow this in order. Every step is a `PATCH /v1/incidents/:id` call or a note in the incident's timeline, so the incident record itself becomes the record of the response.

## 1. Detect → open an incident within 1 hour

Whoever notices (an alert from E17, a report from a tenant, a security researcher) opens an incident immediately, even with incomplete information:

```
POST /v1/incidents
{
  "title": "<short description>",
  "severity": "low|medium|high|critical",
  "detectedAt": "<ISO timestamp, now>",
  "dataCategories": ["<best guess, refine later>"],
  "affectedTenantIds": ["<best guess, refine later>"]
}
```

`IncidentService.open()` immediately computes whether an NDPC (Nigeria Data Protection Commission) notice is required: `severity` is `high` or `critical` **and** `dataCategories` is non-empty. If so, `ndpcNotifyDeadline = detectedAt + 72 hours` is set and returned in the response — that deadline does not move, so put it on a calendar now, not after triage.

E17's operational alerting (`ops.alert`) pages the on-call engineer; this incident register is the _legal/regulatory_ record, not the pager — the two are deliberately separate (see the epic's "Notes and decisions").

## 2. Contain

Standard incident response: revoke the exposed credential, take down the misconfigured resource, patch the vulnerability. Log each containment action as a note via `PATCH /v1/incidents/:id { "note": "..." }` — do not wait until the end to write these down.

## 3. Assess

Nail down, and correct the incident record as you learn more:

- **Data categories** — which fields were actually exposed (`PATCH` to correct `dataCategories` if the initial guess was wrong; re-running `assess72h()` recomputes the deadline off the same `detectedAt`, so correcting the record doesn't reset the clock).
- **Subjects** — how many people, which tenants (`affectedTenantIds`, `estimatedSubjects`).
- **Jurisdiction** — any UK consumers affected sets `icoNotifyRequired` (manual judgement call by the platform owner today; not yet automated).

## 4. Notify NDPC (≤ 72 hours from detection, when required)

If `ndpcNotifyRequired` is true, the platform owner submits notice to the NDPC before `ndpcNotifyDeadline`. Template:

> Subject: Data breach notification — Verify Platform (Tunnel Light Global Concept Ltd)
>
> Date of detection: `<detectedAt>`
> Nature of the breach: `<summary>`
> Data categories affected: `<dataCategories>`
> Approximate number of data subjects: `<estimatedSubjects>`
> Measures taken: `<containment actions from step 2>`
> Contact: `<DPO contact>`

Record `ndpcNotifiedAt` via `PATCH /v1/incidents/:id` once sent.

## 5. Notify affected tenants

Tenants named in `affectedTenantIds` are notified via E14 (`NotificationService`) — no dedicated E19 template exists yet for this specific notice; until one is added, send manually and log it as a timeline note.

## 6. Consumer notice decision

If consumers are directly affected and the exposure creates a real risk to them (not just a technical/internal exposure), the platform owner decides whether to notify them directly, based on NDPA's risk-based standard. Record the decision and reasoning as a note, whichever way it goes.

## 7. UK/ICO track

If `icoNotifyRequired`, follow the equivalent UK GDPR Art. 33/34 process (72-hour ICO notice, consumer notice if high risk). Not yet automated in code — tracked manually, flagged in `docs/compliance/data-map.md`'s human checklist.

## 8. Close and post-mortem

Once contained, notified, and resolved: `PATCH /v1/incidents/:id { "status": "closed", "postmortemUrl": "<link>" }`. The post-mortem should cover what happened, why, what was done, and what changes prevent a repeat — linked, not duplicated, here.

## Tabletop rehearsal script

Run this at least once (recorded in the epic's GitHub issue as the AC10 walkthrough) without a real incident, to prove the runbook actually works end to end:

1. As platform support, `POST /v1/incidents` with a fabricated scenario: `{"title": "Test leak", "severity": "high", "detectedAt": "<now>", "dataCategories": ["report.contactEmail"], "affectedTenantIds": ["<a real tenant id>"]}`.
2. Confirm the response has `ndpcNotifyRequired: true` and `ndpcNotifyDeadline` exactly 72 hours after `detectedAt`.
3. Log in as an owner of the named tenant and confirm the incident is visible, read-only, at `GET /v1/incidents/mine`.
4. `PATCH` a containment note, then a resolution note.
5. `PATCH { "status": "closed", "postmortemUrl": "https://example.test/postmortem" }` and confirm `closedAt` is set and the timeline has every step recorded.
6. Delete or mark the test incident clearly as a drill in its title before leaving it in a shared environment.
