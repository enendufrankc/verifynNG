# Code Format Specification

> Source of truth for the Verify Platform unit code format, alphabet, entropy budget, threat model, and key rotation procedure.

## Code format

### Version 2 (current): 5-segment format

```
<tenant>.<tier>.<kid>.<payload>.<checksum>
```

| Segment    | Description                                          | Character set    | Length             |
| ---------- | ---------------------------------------------------- | ---------------- | ------------------ |
| `tenant`   | Lowercase tenant slug (e.g. `ivoryglow`)             | `a-z0-9`         | 2–20 chars         |
| `tier`     | Code tier: `1` (public QR) or `2` (hidden unit code) | `1` or `2`       | 1 char             |
| `kid`      | Key identifier used to sign this code                | `a-z0-9`         | 1–8 chars          |
| `payload`  | Crockford base32 encoded data                        | Crockford base32 | 20 chars (default) |
| `checksum` | HMAC-SHA256 truncated to base32                      | Crockford base32 | 8 chars            |

**Example:** `ivoryglow.2.k1.ABCDEFGH1234567890AB.XYZDEF12`

### Version 1 (legacy): 4-segment format

```
<tenant>.<tier>.<payload>.<checksum>
```

Legacy codes have no `kid` segment. They are parsed with `kid=legacy` and verified using the legacy secret loaded under that kid.

**Example:** `ivoryglow.2.ABCDEFGH12345678ABCD.XYZDEF12`

## Crockford base32 alphabet

```
0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

Excludes: `I`, `L`, `O`, `U` (transcription error risks).

Human transcription normalisation:

- Lowercase → uppercase
- Hyphens and spaces → removed
- `I` → `1`, `L` → `1`, `O` → `0` (applied to base32 segments only, not the tenant slug)

## Payload layout

| Offset | Length   | Description                    |
| ------ | -------- | ------------------------------ |
| 0–3    | 4 chars  | Batch watermark (HMAC-derived) |
| 4–19   | 16 chars | Crypto-random                  |

### Entropy budget

- **Random portion:** 16 base32 characters × 5 bits/char = **80 bits** of cryptographic randomness.
- **Watermark portion:** Deterministic (HMAC of tenant + batchId + kid) — provides batch attribution without a DB lookup.
- **Full payload:** 20 chars × 5 bits/char = 100 bits total positional entropy.
- **Checksum:** HMAC-SHA256 truncated to 8 base32 chars (40 bits) — forgery requires the signing key.

**Threat model:** An attacker who compromises the database (code hashes only) cannot mint valid codes because they lack the HMAC signing key. An attacker who obtains a single valid code cannot derive the signing key or predict other codes (80 bits random + HMAC). An attacker who obtains the signing key can mint arbitrary codes — key rotation is the recovery procedure.

## Checksum computation

```
checksum = CrockfordBase32(HMAC-SHA256(key, "${tenant}|${tier}|${kid}|${payload}")[0:8])
```

For legacy codes (no kid):

```
checksum = CrockfordBase32(HMAC-SHA256(key, "${tenant}|${tier}|${payload}")[0:8])
```

Comparison is constant-time to prevent timing attacks.

## Storage

Tier-2 codes are **never stored in plaintext**. The database stores:

```
SHA-256(code) → hex digest (64 chars)
```

This is a one-way hash. A database leak reveals nothing mintable.

## Key rotation procedure

### When to rotate

- Scheduled (annual best practice)
- After any suspected key compromise
- When changing signing algorithm

### Rotation steps

1. **Generate a new key** (e.g. `k2` as 32+ bytes of crypto-random hex).
2. **Add the new key** to `CORE_KEYS` alongside the old key (`k1`). Set `CORE_ACTIVE_KID=k2`.
3. **Deploy.** New codes are signed with `k2`. Existing `k1` codes continue to verify because both keys are in the ring.
4. **Wait** for all printed codes with `k1` to expire from circulation (business decision — typically after the batch is sold through).
5. **Remove `k1`** from `CORE_KEYS` once no longer needed.

### Verification during rotation

Codes generated under `k1` still verify after `k2` becomes active because the key ring contains both keys. The `kid` segment in the code tells the verifier which key to use. Codes with an unknown `kid` fail with `UnknownKeyError`.

### Backward compatibility

The legacy 4-segment format is supported by loading the legacy secret under `kid=legacy`. Legacy codes parse with `legacy: true` in `ParsedCode` and verify using the legacy HMAC formula (no kid in the message).

## Batch watermarking

The first 4 characters of the payload are a batch watermark:

```
watermark = CrockfordBase32(HMAC-SHA256(key, "watermark|${tenant}|${kid}|${batchId}")[0:4])
```

This is deterministic and HMAC-derived — not stored. A leaked cluster of codes is attributable to a batch without a DB lookup by extracting the watermark from the payload.

## Redaction

Codes are redacted for display in responses and logs:

```
ivoryglow.2.k1.ABCD…   (first 4 payload chars + "…")
```

The full code is never returned after scanning to prevent screenshot-replay of "authentic" pages.

## Reference implementation

All logic is in `packages/core` — pure TypeScript, zero I/O, zero framework, 100% test coverage, property-tested with `fast-check`.

- `src/alphabet.ts` — Crockford base32, normalisation
- `src/keys.ts` — KeyRing interface, StaticKeyRing
- `src/code.ts` — generateCode, parseCode, verifyChecksum
- `src/hash.ts` — hashForStorage
- `src/batch.ts` — deriveBatchWatermark, watermarkOf
- `src/manifest.ts` — canonicalize, signManifest, verifyManifest, receiptHash
- `src/gs1.ts` — toGs1DigitalLink, parseGs1DigitalLink
- `src/errors.ts` — InvalidCodeError, UnknownKeyError
