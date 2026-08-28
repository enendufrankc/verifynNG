# Verify Platform — Incremental Architecture

**Style:** adapted from the 12-step incremental system-architecture method (each step = one new concern, motivated by a real question or failure; every layer stays visible so the whole system is always in view).

**Status legend:** ✅ built (local M1) · 🔨 next · ⬜ later

---

## Step 1 — A simple demo ✅

*"A consumer scans a QR code. What happens?"*

```
Phone (QR scan) → Verify Page → Verify API → Code Registry
                                              (unit lookup)
```

The dumbest end-to-end loop: code in, verdict out. Everything else exists to protect or enrich this loop.

---

## Step 2 — Give the brand control ✅

*"Where do codes come from?"*

```
Admin Console → Admin API → Mint Service → Code Registry
                                    └→ QR Sheet + Manifest exports
```

Brand mints a batch (product × OEM × count), gets printable QR artwork. Codes exist before products do.

---

## Step 3 — One code or two? ✅

*"A shopper scans a bottle in a store. Does she break the system?"*

```
Phone → Verify API → ┬─ Tier 1 (public QR): stateless, unlimited scans → product line info
                     └─ Tier 2 (hidden scratch code): stateful → unit history & verdict
```

The store-scan problem is solved by never letting one code do two jobs.

---

## Step 4 — The code that shouldn't be forgeable ✅

*"A counterfeiter studies our QR. What can he do with it?"*

```
Verify API → [Rate Limiter] → [Code Signature Check (HMAC)] → [Hash-only Registry Lookup]
```

Unguessable codes, checksum before any DB hit, hashes-only at rest, rate limits. A leaked database yields nothing mintable.

---

## Step 5 — Codes must reach the factory safely 🔨

*"The OEM in China gets a file of codes. What stops a leak — or a swap?"*

```
Admin Console → Manifest Signer → Verified OEM Registry
                       └→ signed manifest (exact codes + artwork)
                                → OEM prints → returns Receipt Hash (proof of what was printed)
```

Delivery is authenticated, content is signed, printing is proven. Leaks are traceable to a batch/OEM via code-range watermarking.

---

## Step 6 — Many brands, one platform 🔨

*"Brand #2 wants in. Do we copy the server?"*

```
Verify API → Tenant Router → [Tenant A namespace] [Tenant B namespace] ...
Admin API  → Tenant Router → same isolation
```

Everything is namespaced by tenant (`/ivoryglow/v/<code>`, `/tenant-b/v/<code>`). Ivory Glow = tenant #1, not the architecture.

---

## Step 7 — Who is the admin? ⬜

*"An intern shouldn't be able to kill a million codes."*

```
Admin Console → [Tenant Auth (real IdP)] → [Roles: owner / operator / viewer]
```

Replaces the local password. Role-scoped powers: view anything, mint with approval, kill only owners.

---

## Step 8 — A scan is worth remembering ⬜

*"Which batch is being hit hardest this week?"*

```
Verify API → Scan Event Store (append-only: time, geo, device, verdict)
                   └→ Analytics Dashboard (per batch / per tenant)
```

Events never change; insights are computed. This is the pharma lesson: the serial is nothing, the event history is everything.

---

## Step 9 — The code that traveled to three countries ⬜

*"One serial, verified in Lagos, Accra and Nairobi in a week. Now what?"*

```
Scan Event Store → Anomaly Detector (geo dispersion, velocity, dead codes, pre-reveal scans)
                        └→ auto-flag / alert → Admin intervention (flag / kill / restore)
```

Rules first (thresholds). An ML layer is optional later — only if the rules miss patterns humans care about. No AI for its own sake.

---

## Step 10 — Consumers report fakes ⬜

*"The page said 'likely counterfeit.' Then what?"*

```
Verify Page (red/amber state) → [Report Button] → Report Queue → Admin investigation
```

Closes the loop: detection becomes evidence, evidence becomes enforcement.

---

## Step 11 — Where did my system go wrong? ⬜

*"A consumer in Onitsha saw an error. Can we see it?"*

```
Everything → [Logs] [Metrics: scan latency, error rates, rate-limit hits] [Alerts]
```

Observability of the verification path itself — the product is trust, so downtime reads as "counterfeit" to consumers. Must know first.

---

## Step 12 — Product pages (the northstar) ⬜

*"Tier-1 scans land somewhere. Make it a storefront."*

```
Tier 1 scan → Verify API → Tenant Product Page (batch info + product profile + verification education)
Admin Console → Simple Page Builder (per tenant)
```

The Ivory Glow product page prototype is the template. Verification is the hook; pages are the retention.

---

## The whole system, one view

```
                    CONSUMER                    BRAND                    OEM
                       │                         │                       │
                 QR scan (T1/T2)          mint batch, monitor      print from signed manifest
                       │                         │                       │
        ┌──────── phone browser ──────── admin console ─────────────── receipt hash ─┐
        │                        │                │                                  │
        ▼                        ▼                ▼                                  ▼
   [Verify Page] ──────► [Verify API] ◄──── [Admin API] ◄──────────── [Manifest Signer]
        │            rate limit, signature, tenant routing                   │
        │                        │                                           │
        │                        ▼                                           │
        │              [Code Registry (hashes only)] ◄── [Mint Service] ─────┘
        │                        │
        │                        ▼
        └────────────► [Scan Event Store] ──► [Anomaly Detector] ──► [Reports]
                                             └► [Analytics]  └► [Observability]
```

## Build order (matches what exists)

| Step | State |
|---|---|
| 1–4 Code engine, two tiers, security core | ✅ running locally |
| 5 OEM manifest + receipt | 🔨 Milestone 2 |
| 6 Tenant router (multi-tenant) | 🔨 Milestone 3 |
| 7–11 Real auth, analytics, anomaly rules, reports, observability | ⬜ post-deployment |
| 12 Product pages | ⬜ northstar |
