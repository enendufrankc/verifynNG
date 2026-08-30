# Consumer report flow

1. `GET /v1/verify/:code` returns a `red`/`amber`/`unknown`/`decommissioned`/`flagged` verdict with a `scanEventId`.
2. The verify page (E09) or, until it ships, the `ReportForm` Storybook story mounts `<ReportForm scanEventId=... verdict=... />`.
3. The consumer fills seller/location/channel/description, uploads up to 5 photos (client-downscaled to ≤2000px before upload), optionally leaves an email with consent.
4. `POST /v1/public/:tenantSlug/reports` derives unit/batch/product/verdict server-side from the `scanEventId` — the client never sends a code, unit id, or verdict directly.
5. A `RPT-XXXXXX` reference is returned immediately; photos process asynchronously (`photo.process` queue job) and the report shows `new` until a tenant triages it.
6. The consumer can poll `GET /v1/public/:tenantSlug/reports/:reference` for status (no PII, no notes returned).
7. If the consumer left an email, they receive a `report.consumer_ack` acknowledgement immediately, and a `report.consumer_update` whenever a tenant operator changes the report's status with "notify consumer" checked.
