# Triage guide (web-admin)

Roles: `owner`/`operator` can act; `viewer` sees a read-only detail page.

- Queue at `/reports` — filter by status, or use the "New"/"Mine" saved views.
- Detail page shows photos, linked unit's scan history (E06) and anomaly chips (E07, once shipped), notes thread, and status history.
- Status flow: `new → triaged → investigating → closed` (outcome required to close). `closed → investigating` is allowed as a reopen. Every transition is audited (`report.status.change`) and, with "Notify consumer" checked, sends `report.consumer_update` if the report has a contact email. Status changes are protected against concurrent edits — a second operator changing the same report at the same moment gets a 409 and must refresh.
- Export: `GET /v1/reports/export.csv?...` — contact columns (`contactEmail`/`contactPhone`) only appear for `owner`. One `report.export` audit row per call.
