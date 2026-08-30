# Cross-epic requests

Interfaces one epic needs another to provide. Collected when the epics were written (2026-08-28) so owners see them before starting. **Rule:** the _providing_ epic owns the change and adds it to its own task list when it claims the epic; the requesting epic stubs behind the interface until then. Tick when shipped on `main`.

## To E00 Foundation

- [ ] Compose port registry (final): fake-sms 4101 · fake-pay 4102 · fake-geo 4103 · fake-oidc 4104 (E20) · webhook-sink 4105 (E16) · fake-captcha 4106 (E08) · api-worker (no port, E04) · docs 3002 (E18) · grafana 3100 · loki 3101 · tempo 3102 · prometheus 3103 · otel-collector 3104 · uptime-probe 3105 (E17) · postgres-restore 5433 profile `drill` (E18) · k6 profile `load` (E21).
- [ ] `ci.yml` accepts one-line `uses:` includes for E21's `isolation-matrix`, `openapi-check`, `seed-lint`, `test:smoke` jobs.
- [ ] Hand `HealthModule` + request-id middleware to E17 on completion (E17 extends them into `/health` vs `/ready`).
- [ ] `fake-geo` and `fake-sms` stubs are replaced by E06 and E14 respectively — keep ports.

## To E02 Identity & Access

- [ ] Add role `oem` + `oemId` JWT claim (E05). **Partially done by E05 directly:** `oem` added to `TenantRole` (additive migration on `main`) — `RolesGuard`'s hierarchy map already falls back to treating an unrecognised role as its own singleton allowed-set, so no other E02 file changed. The `oemId` JWT claim was **not** added; E05's `OemScopeGuard` resolves `OemUser` from the DB per request instead (the spec's own documented fallback). Leaving this unchecked since the claim itself is still outstanding if a future epic wants it.
- [ ] `UsersService.listMembers(tenantId, { roles })` (E14 routing).
- [ ] `SessionService.issue/revoke` for impersonation sessions; never grants `owner`, max `operator` in write mode (E18).
- [ ] `LoginPolicyHook` multi-provider (`beforePasswordLogin`, `afterPrimaryAuth`) and `Session.amr[]`; optional `Membership.createdVia` (E20).
- [ ] E20 owns `app/(auth)/sso/**` inside E02's auth route group.

## To E03 Tenant Lifecycle

- [ ] Tenant status `restricted` (writes blocked, verify open) + `setRestricted/clearRestricted` (E15). Reconcile with existing `suspended` semantics — one guard, two reasons.
- [ ] `GET /v1/tenants/:slug/public-profile` (E09).
- [ ] `TenantDomain` model + `GET /v1/tenants/by-domain/:host` + `tenant.branding.updated` event (E10).
- [ ] Exempt `/v1/public/:tenantSlug/reports*` from the suspended-tenant guard (E08).
- [ ] `Tenant.offboardedAt`; expose `TenantAcceptanceService.record()` and `TenantExportService.export()` (E19).
- [ ] Tenant setting `notifyOnImpersonation` (E18).

## To E04 Catalog & Minting

- [x] `Batch.expectedShipDate DateTime?` — added by E05 directly (additive migration on `main`), since E04 had already landed and closed. The rest of this line described an interface E04 never actually shipped under those names — E05 instead consumes E04's real `ManifestService.open()` / `ExportsService.getSignedUrl()` and writes `Batch.status` directly via the shared Prisma client (no `BatchService.setStatus` exists); `BatchLifecycleService` is the sole enforcer of the post-mint state machine (E05).
- [ ] `Batch.isTest` so `vk_test_` keys mint unbilled; E12 skips `isTest` (E16).
- [ ] `MintService.mintBulk({ skipExports })` for the 50k-unit seed (E21).
- [ ] `product.updated` event (E10).
- [ ] Link "Units & recall" from batch detail to E07's unit views (E07).
- [ ] Bind `ENTITLEMENT_POLICY` token to E15's `PlanEntitlementPolicy` when E15 ships (E15).

## To E06 Verification & Scan Events

- [ ] Include `scanEventId` in the verify response (E08, E09).
- [ ] Add `batchId`/`productId` to the `scan.recorded` payload (E12).
- [ ] Accept forwarded IP/UA behind `x-verify-proxy-key` from web-verify SSR (E09).
- [ ] Honour `x-synthetic-probe` header — skip ScanEvent + metering; call `Metrics.rateLimitHits.add()` (E17).
- [ ] Expose `ScanEventRepository.forUnit/byIpHash`, `ipHash` on ScanEvent, dev-only scan-replay endpoint (E07).
- [ ] Document degraded behaviour on Redis/Postgres loss: return 503, never a false verdict (E21 chaos test).

## To E08 Consumer Reporting

- [ ] Expose `CaptchaPort` for E18's public support form.
- [ ] Call `ConsentService.record()` for contact consent; expose `Report.referenceNumber` + `contactEmail` lookup for DSAR (E19).

## To E11 Admin Shell

- [ ] Chart tokens `--chart-1..6` in `packages/ui` (E12).
- [ ] Confirm `(platform)`/`(support)` route-group naming with E18/E19 — pick one and document in `nav.config.ts`.
- [ ] Accept `instrumentation.ts` in web-admin (E17). Same for E09 in web-verify.
- [ ] `HelpLink` one-liner slot in every module page header (E18).

## To E13 Audit & Security

- [ ] `AuditLog.impersonatedBy` + `impersonationSessionId`; accept them in `AuditContext` (E18).
- [ ] Quota kinds registered by others via `QuotaService.registerKind()`: `manifest_downloads_per_hour` (E05 — **done**, registered in `OemManifestModule.onModuleInit()` so it's present under `Test.createTestingModule` too, not only `main.ts`'s bootstrap), `reports_per_ip_per_hour`, `report_uploads_per_ip_per_hour` (E08), `pages.storageBytes` (E10).

## To E14 Notifications

- [ ] Templates requested: `report.consumer_ack`, `report.consumer_update` (E08) · `subscription.restricted`, `subscription.reactivated`, `trial.ending` (E15) · `webhook.dead_lettered` (E16) · `ticket.*`, `impersonation.started` (E18) · `ops.alert` (E17) · `dsar.verify|ready|erased`, `legal.reaccept` (E19) · `anomaly.alert` data contract supplied by E07.
- [ ] `mail.inbound` event from Mailpit/Resend inbound (E18).
- [ ] Marketing-vs-transactional gate via `ConsentService.has(subject, 'marketing')` (E19).

## To E15 Billing

- [ ] Implement `PagesEntitlementPort` (E10) and `EntitlementService.limitsFor()` consumed by E13/E16/E20.
- [ ] Consume only `UsageSummary` rows with `finalisedAt` set (E12).

## To E17 Observability

- [ ] Publish the degraded-mode contract jointly with E06 (E21).

## To E19 Compliance

- [ ] Agreed retention with E12: rollups indefinite, raw `UsageEvent` 24 months, `ScanEvent.geoCity` scrubbed at 180 days.

## To E21 Quality Engineering

- [ ] Seed 30 days of synthetic ScanEvents with planted anomalies (E12, E07).
- [ ] Nightly restore drill uses E18's `docker/scripts/backup.sh|restore.sh`.

## Pre-minted production batch (2026-08-30) — binding facts for E04, E06, E13, E09

- **10,000 IVORY GLOW units were minted on 2026-08-30 with `tools/mint-oneoff`** (batch `IVORYGLOW-20260830-A`, codes `ivoryglow.<tier>.k1.<payload>.<checksum>`, 5-segment core format, kid `k1`). Labels are being printed against `https://verifyproduct.app/v/<code>`. These codes are permanent.
- **The signing key used is the platform's production `k1`.** It lives outside the repo (`ivoryglow-codes-20260830/key.txt`, backed up by the owner). E13's `SecretsPort`/`KeyRing` must load it as `k1` in production; never generate a different `k1`.
- **E04 must provide an import path** for `import.json` (`{batch, tenant, kid, watermark, products[], units[{unitId, productId, tier1Code, tier2Hash}]}`) that creates the Batch + Units without re-minting (raw tier-2 codes are not available to the platform — only the printer's manifest has them).
- **E06** must resolve these codes exactly as any other (tenant slug `ivoryglow`, tier from the code, hash lookup on `tier2Hash`).
- **E09** takes over `verifyproduct.app` from the interim landing Worker in `tools/landing-verifyproduct/`; the `/v/<code>` URL contract is frozen.
- Product facts for `ivoryglow`: ig004 Turmeric (EAN 5067254398586, NAFDAC A2-108822), ig005 Retinol (EAN 5067254398593, NAFDAC A2-108801), ig006 Vitamin C (EAN 5067254398579, NAFDAC A2-108802). Seed these on `Product` (E04 `gtin`, and a `regulatoryId` field E04 should add).

## Decisions recorded while resolving conflicts

- `fake-captcha` moved from 4104 → **4106**; 4104 stays with `fake-oidc`.
- E08 owns `packages/ui/src/components/ReportForm/**` as a delegated directory inside E11's package.
- E15 owns `app/(support)/subscriptions/**` inside E18's support shell.
- E07 is the sole writer of `Unit.state`; E04 never mutates it.
- E06's `/v1/verify` and E16's `/api/v1/**` are separate routers; E16 never proxies verification.
