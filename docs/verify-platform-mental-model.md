# Verify Platform — Mental Model Brief

**Project:** Tunnel Light Verify Platform (working name)
**Tenant #1:** IVORY GLOW (Tunnel Light Global Concept Ltd — trademark NG/TM/O/2020/11950, Class 3)
**Status:** Pre-build reasoning document. No code written yet.
**Date:** August 2026

---

## 1. What we are building (one sentence)

A multi-tenant product-authenticity platform where brands generate cryptographically secure unit codes, deliver them to verified manufacturers as signed manifests, and consumers verify physical products by scanning a QR code — with product pages as a natural extension.

**Northstar:** "Shopify of product authenticity" — any verified business can onboard, mint codes, and get both a verification flow and a simple product page for their goods. IVORY GLOW is the first tenant and the proving ground, not the architecture.

---

## 2. The global standard we anchor to

### GS1 Digital Link (ISO/IEC 15459 lineage)

The barcode people (GS1) define the world's supply-chain identity stack. The modern web-friendly form:

```
https://<brand-domain>/01/<GTIN>/10/<batch>/21/<serial>
     └── product identity ──┘└─ batch ─┘└ unit identity ┘
```

- **GTIN** — what the product _is_ (same for every unit)
- **Batch/Lot** — when and where it was made
- **Serial** — _this specific unit_ (crypto-random, unguessable, never sequential)

We adopt this structure (or a tenant-scoped equivalent) so codes are industry-legible and future-compatible with GS1 resolvers, without paying GS1 membership to start.

### How the biggest players secure theirs (pharma: US DSCSA, EU FMD)

Four lessons, in order of importance:

1. **The serial alone proves nothing — the event history is the proof.** Every legitimate supply-chain node logs scan events (EPCIS). A serial seen in Lagos, Kano, and Accra within a week is counterfeit evidence _regardless_ of code validity.
2. **Aggregation.** Bottle → shrink-wrap → case → pallet. When a case is scanned at the distributor, all 48 child serials are implicitly accounted for. Missing/duplicated children expose grey-market leaks.
3. **Codes are signature-covered.** Even an insider with database access cannot mint a valid code without a key held elsewhere.
4. **Decommissioning.** A serial has a lifecycle: commissioned → active → sold/destroyed/recalled. Verified ≠ valid forever.

### FMCG reality in counterfeit-heavy markets (Nigeria, India, China)

The pattern that works at consumer scale is **two codes, two jobs** (section 4). This is the recharge-card model Nigerian consumers already understand and trust.

---

## 3. Core domain model

```
Tenant (business)
 └─ Product (GTIN / brand SKU, e.g. IVORY GLOW Turmeric & Curcumin 1000ml)
     └─ Batch (production run, linked to an OEM)
         └─ Unit (one physical bottle → one unique serial)
             ├─ Code Tier 1: PUBLIC QR (product + batch identity, not unit claim)
             └─ Code Tier 2: HIDDEN unit code (scratch-off / under seal)
```

**Key entities:**

- **Tenant** — brand owner. Verified business identity.
- **Product** — the sellable SKU.
- **OEM** — verified manufacturer that produces a batch. Receives code manifests.
- **Batch** — production run: product + OEM + volume + dates.
- **Unit** — one physical item. Two codes (tiers below).
- **ScanEvent** — one observation of a code: timestamp, code tier, approximate geo (IP-derived), device class, outcome. Append-only.
- **Manifest** — the signed code package delivered to an OEM (batch of unit codes + artwork refs + receipt hash).

---

## 4. The two-tier code architecture (the heart of the design)

The store-scan problem: a product on a store shelf may be scanned by many browsing customers who don't buy. A naive "first scan claims the unit" system breaks completely here.

**Resolution: never make one code do two jobs.**

### Tier 1 — Public QR (on the outside of the container)

- Encodes: product identity + batch (+ optionally unit serial, but _without claims semantics_)
- **Scan policy: unlimited, no state changes, no verdicts.** Browsers in a store can scan freely, forever.
- Consumer sees: product profile page, batch/manufacture info, "✓ This is a genuine IVORY GLOW product line — for full unit authentication, find the hidden code under the cap/seal."
- Purpose: marketing + education + low-friction assurance. This is the code that links to the product page (the northstar product-page feature lives here).

### Tier 2 — Hidden unit code (scratch-off panel inside the pack / under cap / under seal)

- Encodes: unit serial, cryptographically unique, **unreadable before purchase**
- **Scan policy: stateful.** Scan history is tracked and shown.
  - First-ever scan → ✅ "You are the first to verify this unit. Purchased new, genuine."
  - Later scans → shown honestly: "First verified <date, city>. Verified N times since." Soft amber if anomalies.
- Purpose: actual counterfeit detection. Pre-purchase, a counterfeiter cannot read it — so they cannot copy it onto fakes at scale. Copying is only possible post-purchase (one real bottle → many fakes), which the scan history exposes.

### Why soft verdicts, not binary (edge cases)

- **Resale/gifting:** second-hand scans of a legitimately-owned used bottle are normal. History display, not alarm.
- **Returns:** a returned unit re-scanned by the retailer or next buyer.
- **Damaged/tampered packaging:** hidden code may become visible in-store.
- Therefore: verdicts are **anomaly scores**, not booleans.

### Anomaly signals (computed from ScanEvent history)

| Signal               | Meaning                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Scan count over time | 1 real bottle can't be "first-verified" twice; 50 scans of one unit serial = mass copying |
| Geo dispersion       | Same serial verified in Lagos + Accra + Nairobi in a week                                 |
| Velocity             | Burst of scans across many serials from one IP = enumeration attack                       |
| Pre-reveal scans     | Tier-2 code scanned before the batch's earliest plausible purchase date                   |
| Dead codes           | Valid serials from a batch that never shipped (OEM leak indicator)                        |

---

## 5. Security model

> **Full specification:** [`docs/core-code-format.md`](core-code-format.md) — format, alphabet, entropy budget, threat model, rotation procedure.

### Code format (draft)

```
<tenant>.<tier>.<payload>.<checksum>
payload := crypto-random base32 (≥ 20 chars ≈ 100+ bits entropy)
checksum := HMAC-SHA256(payload, SERVER_SECRET) truncated
```

- **Unguessable**: crypto-random, no sequence, no structure to predict.
- **Unforgeable**: checksum means validity is checkable _before_ any DB hit; forging requires the server secret.
- **Stored as hashes only**: DB holds HMAC-SHA256(code) — a database leak reveals nothing mintable.
- **Traceable**: code ranges are derived per-batch/per-OEM so any leaked/counterfeit cluster is attributable to its source (cryptographic watermarking).

### OEM code sharing (the "verified OEM" flow)

The brand never hands raw codes to a factory for arbitrary printing. Instead:

1. Brand mints a batch (N units) in the platform.
2. Platform generates a **Manifest**: the exact unit codes + label artwork + batch metadata, delivered over an authenticated channel to the verified OEM.
3. Manifest is **signed** (brand key). OEM's system returns a **receipt hash** — cryptographic proof of what was actually printed.
4. Optional: OEM prints placeholder/sequential container IDs; unique Tier-2 labels are applied by the brand after import (removes factory from the trust chain entirely — tradeoff: manual labour).

### Anti-abuse at the verification endpoint

- Rate limiting per IP, per code, sliding window.
- Enumeration detection (invalid-code probing).
- Scan events append-only; verdicts computed, never hand-edited.
- No code is ever displayed back in full after scanning (prevent screenshot-replay of "authentic" pages — page shows verdict + partial code only).

### Honest limits (documented, not hidden)

- A determined counterfeiter can copy one real Tier-2 code onto some fakes. The system _detects_ this via duplicate scan history; it cannot _prevent_ it. Detection is the product.
- QR codes are public infrastructure; security lives in the unguessability + signature + event history, never in "secret URL".

---

## 6. Platform (multi-tenant) requirements

- **Tenant isolation:** every code, scan, and page is namespaced by tenant (`/ivoryglow/v/<code>`, `/tenant-b/v/<code>`).
- **Onboarding:** businesses verify identity before minting codes (the platform's own credibility depends on not hosting fake "authenticity" for counterfeiters). IVORY GLOW's existing trademark registration is the model artifact.
- **Product pages (northstar, later):** each tenant's Tier-1 QR lands on a simple product profile page (like the `ivory-glow-page/index.html` prototype already built) with verification education built in.
- **Admin console per tenant:** mint batches, export manifests, scan analytics, flag/kill codes, manage OEMs.
- **Scale assumption:** design for 10⁵–10⁷ units/year/tenant from the start (Firestore/SQL-friendly schemas, indexed hash lookups, batch job generation).

---

## 7. Local-first build plan (before any infra decisions)

Storage behind a thin interface so Firebase ↔ Cloudflare ↔ SQL is swappable later.

```
verify-platform/
  packages/
    core/          # domain model, code minting (HMAC, base32), verification logic — pure, testable, infra-free
    qr/            # QR artwork generation + printable manifest export (PDF/PNG/ZIP)
    api/           # verification endpoint + admin API (local: simple Node server + SQLite; later: Firebase Functions or CF Workers)
    web-verify/    # consumer verification page (mobile-first, tier-1 & tier-2 flows)
    web-admin/     # tenant admin console (mint, manifests, analytics)
```

**Local milestone 1 (end-to-end proof):**

1. CLI mints a batch of IVORY GLOW Tier-2 codes → SQLite (hashes only)
2. CLI renders QR sheet PDF for a batch
3. Local server + verification page: scan → verdict with scan history
4. Tier-1 page = the existing ivory-glow-page prototype, linked

**Milestone 2:** OEM manifest signing + receipt verification.
**Milestone 3:** second tenant onboarding (proves multi-tenancy), analytics dashboard.

---

## 8. Open questions (decided before milestone 1 build)

- [ ] Tier-2 physical carrier: scratch-off label vs under-cap print vs peel sticker — cost/quote from label printer needed (affects artwork export format)
- [ ] Code alphabet & length final spec (base32 Crockford vs URL-safe base32)
- [ ] Does Tier 1 QR include unit serial or only product+batch? (Including it enables per-unit Tier-1 analytics but links the tiers — privacy/leak tradeoff)
- [ ] Geo granularity for scan history shown to consumers (city-level vs country-level — privacy)
- [ ] Offline verification fallback (USSD/SMS — Nigeria-relevant, common in recharge-card auth)
- [ ] Admin auth model for tenants (separate from any existing store admin)
- [ ] Platform name/domain

---

## 9. What this is NOT

- Not one-time-claim verification (store browsing breaks it — see §4)
- Not secret-URL security (obscurity is not security)
- Not IVORY GLOW-specific (tenant #1, not the architecture)
- Not a product website (the verification flow is the product; product pages are a later tenant feature)

---

_Companion artifacts: `ivory-glow-page/` (Tier-1 product page prototype), `IVORY-GOLD/` (label PDFs + trademark letter — tenant #1 source of truth)._
