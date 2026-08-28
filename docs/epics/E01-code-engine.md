# E01 — Code Engine (`packages/core`)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| Wave            | 0                                                                                           |
| Status          | done                                                                                        |
| Owner           | pi-agent                                                                                    |
| GitHub Issue    | [#2](https://github.com/enendufrankc/verifynNG/issues/2)                                    |
| Depends on      | E00                                                                                         |
| Unblocks        | E02 (token hashing helpers), E04, E05, E06                                                  |
| Readiness items | §2 key rotation for HMAC signing key · §11 test suite for the code engine · mental-model §5 |

## Goal

A pure TypeScript package that is the single source of truth for what a code _is_: how it is generated, checksummed, hashed at rest, parsed, and how manifests are signed and verified — with **versioned keys** so the signing secret can rotate without invalidating a single printed bottle. Zero I/O, zero framework, 100% branch coverage, property-tested. Every other epic imports this instead of touching `node:crypto` directly.

## Scope

**In:** code format, Crockford base32, HMAC checksum, hash-at-rest, key ring with versions, manifest canonicalisation + signing + verification, receipt-hash computation, code-range watermarking primitive, GS1 Digital Link URI builder/parser, constant-time comparisons, typed error classes.

**Out:** persistence of keys (E13 secrets abstraction supplies key material; E01 defines the `KeyRing` interface), rate limiting (E06), QR image rendering (E04), any verdict logic (E06).

## Owned paths

```
packages/core/**
```

## Interfaces

**Consumes:** nothing at runtime. Receives key material via the `KeyRing` interface.

**Exposes** (all pure functions / plain classes):

```ts
// keys
interface KeyRing { active(): { kid: string; secret: Uint8Array }; get(kid: string): Uint8Array | undefined }
class StaticKeyRing implements KeyRing            // built from env for local/dev; E13 may supply another impl

// codes  — format: <tenant>.<tier>.<kid>.<payload>.<checksum>
type Tier = 1 | 2
generateCode(ring, { tenant, tier, payloadLength?: 20 }): { code: string; kid: string }
parseCode(code): ParsedCode | null                 // never throws
verifyChecksum(ring, code): { ok: true; parsed } | { ok: false; reason }
hashForStorage(code): string                       // SHA-256 hex — the only thing stored for tier-2
redactCode(code): string                           // "ivoryglow.2.k1.ABCD…" for responses/logs
normalizeCode(input): string                       // trim, uppercase, accept "-" and " " separators, map I/L/O→1/1/0 per Crockford

// batch traceability
deriveBatchWatermark(ring, { tenant, batchId }): string   // 4-char block embedded in payloads
watermarkOf(parsed): string

// manifests
canonicalize(obj): string                          // RFC 8785-style stable JSON
signManifest(ring, manifest): SignedManifest       // adds { kid, alg:'HS256', signature }
verifyManifest(ring, signed): boolean
receiptHash(printedCodes: string[]): string        // what OEM returns; order-independent

// GS1 Digital Link
toGs1DigitalLink({ baseUrl, gtin, lot?, serial? }): string
parseGs1DigitalLink(url): { gtin, lot?, serial? } | null

// errors
class InvalidCodeError, class UnknownKeyError
```

Domain events: none (pure package).

## Data model

None. (Key versions are referenced by `kid` inside the code; `Unit.tier1Code` and `Unit.tier2Hash` already exist in E00's schema.)

## Tasks

- [x] T1 Package scaffold: `packages/core` with tsup build (ESM + CJS + d.ts), Vitest, `fast-check` for property tests, 100% coverage threshold enforced in CI.
- [x] T2 Crockford base32 encode/decode + `normalizeCode` (accepts human transcription: lowercase, `-`/space separators, I/L→1, O→0).
- [x] T3 `KeyRing` interface + `StaticKeyRing` (parses `CORE_KEYS="k1:hex,k2:hex"` and `CORE_ACTIVE_KID`).
- [x] T4 `generateCode` / `parseCode` / `verifyChecksum` with the new 5-segment format including `kid`. Checksum = HMAC-SHA256(`${tenant}|${tier}|${kid}|${payload}`) → 8 base32 chars. Constant-time compare.
- [x] T5 Compatibility parser for the legacy 4-segment milestone-1 format (`legacy/verify-platform/src/core/crypto.js`) so existing test QR sheets still verify; flag `legacy: true` in `ParsedCode`.
- [x] T6 `hashForStorage`, `redactCode`.
- [x] T7 Batch watermarking: `deriveBatchWatermark` and payload layout `[4 watermark][16 random]`; document the entropy budget (16 chars ≈ 80 bits random + HMAC checksum).
- [x] T8 Manifest canonicalisation, `signManifest`, `verifyManifest`, `receiptHash`.
- [x] T9 GS1 Digital Link build/parse.
- [x] T10 Key rotation test: codes generated under `k1` still verify after `k2` becomes active; codes under unknown `kid` fail with `UnknownKeyError`.
- [x] T11 `docs/core-code-format.md`: the spec of the format, alphabet, entropy, threat model, rotation procedure. Update `docs/verify-platform-mental-model.md` §5 to point at it.

## Acceptance criteria

- [x] AC1 `pnpm --filter @verifyng/core test` reports 100% statements/branches/functions/lines.
- [x] AC2 Property test: for 10,000 random `(tenant, tier)` inputs, `verifyChecksum(generateCode(...))` is `ok` and any single-character mutation of the code fails.
- [x] AC3 Property test: `normalizeCode` makes `parseCode` accept lowercase, `-`-separated and I/L/O-substituted transcriptions of any generated code.
- [x] AC4 Rotation: test from T10 passes; documented procedure in `docs/core-code-format.md`.
- [x] AC5 A manifest signed with `k1`, mutated in any field, fails `verifyManifest`; `receiptHash` is identical for shuffled input orders.
- [x] AC6 Legacy codes from `legacy/` verify when the legacy secret is loaded as `kid=legacy`.
- [x] AC7 Package has no runtime dependency other than Node built-ins (checked in CI via `depcheck`).

## Testing

Unit + property tests only (pure package). Fixture file of 50 known-good codes and their hashes checked into `packages/core/test/fixtures/` so downstream epics can use them in integration tests.

## Compose services added

None.

## Notes and decisions

- Adding `kid` to the code costs 2 characters on the QR; accepted for rotation. Human-typed entry uses `normalizeCode`.
- Watermark is HMAC-derived, not stored, so a leaked cluster of codes is attributable to a batch without a DB lookup.
