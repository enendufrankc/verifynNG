# Core key rotation runbook

The tier-2 code HMAC signing key ("core key") is the root of trust for every
minted code's checksum. This runbook covers rotating it without breaking
codes already printed on packaging.

## How it works

- `CORE_KEYS_JSON` holds a keyring: `{ "active": "<kid>", "keys": { "<kid>": "<hex secret>", ... } }`.
- Every mint stamps the code with the **active** kid (`packages/core`'s
  `generateCode()`); every verify looks up the code's own embedded kid
  (`parseCode(...).kid`) and checks it against that kid's secret — **not**
  necessarily the currently-active one.
- This means: rotating changes which key _new_ mints use. It does not
  invalidate anything already minted, as long as the old kid's secret is
  still present in `CORE_KEYS_JSON.keys`.
- `apps/api`'s `SecretsKeyRing` reads `CORE_KEYS_JSON` from
  `docker/secrets/local.env` (via `SecretsPort`/`EnvFileSecrets`) if that
  file has it, else falls back to the env-schema default. The rotate script
  below is the only thing that should ever write to that file.

## Rotating

```
pnpm secrets:rotate-core-key [--file docker/secrets/local.env] [--kid k3]
```

- Generates 32 random bytes, adds them under a new kid (auto-numbered `k1`,
  `k2`, … unless `--kid` is given), and flips `active` to point at it.
- Never deletes or overwrites an existing kid — refuses and exits non-zero
  if `--kid` names one that already exists.
- Prints a diff with key material redacted (only a 4-hex-char prefix and
  byte length are shown) — the full secret only ever goes into the file.

### Deploy

1. Run the rotate command above (locally, or wherever `docker/secrets/local.env`
   is mounted from for the target environment).
2. `docker compose restart api` (or redeploy, in a real environment) — the
   file is read fresh on process start, no image rebuild needed.
3. Confirm: `curl localhost:<api-port>/v1/_dev/keyring` reports the new
   `activeKid`, and the previous kid is still listed in `kids`.
4. Confirm new mints carry the new kid: mint a code and check
   `packages/core`'s `parseCode(code).kid` equals the new active kid.
5. Confirm old codes still verify: `GET /v1/_dev/keyring/verify?code=<a code
minted before this rotation>` still returns `{ ok: true, ... }`.

### First rotation on a fresh environment

If `docker/secrets/local.env` doesn't exist yet, the rotate script bootstraps
it from scratch — starting numbering at `k1`. If the app was already
implicitly using a key under the id `k1` (e.g. the env-schema's built-in
all-zeros development default), that material is _not_ carried over: the
bootstrap mints a brand-new secret under the same kid name, so anything
signed with the old implicit key stops verifying. This only matters for the
very first rotation of an environment that already has live codes out in
the world signed under a schema-default key — which should never be true in
production, but if it ever is, seed the file with the _current_ effective
`CORE_KEYS_JSON` yourself before running the rotate command for the first
time.

## Retiring a kid

**Never retire (remove) a kid from `CORE_KEYS_JSON.keys` while any printed
batch still references it.** A kid can only be safely removed once every
unit minted under it has either been fully consumed (no longer needs
verification) or reprinted under a newer kid.

Before removing a kid `kN`:

1. Query for any unit still referencing it:
   ```sql
   SELECT count(*) FROM "Unit" WHERE code LIKE '%.kN.%';
   ```
   (adjust the pattern to the tier-2 code format in use;
   `packages/core`'s `parseCode()` is the source of truth for the format.)
2. If the count is non-zero, do not retire `kN`. Either wait until those
   units are fully lifecycle-complete, or reprint/relabel them under the
   current active kid first.
3. Once the count is zero, remove the `kN` entry from `CORE_KEYS_JSON.keys`
   by hand (the rotate script deliberately has no "remove" mode — this is a
   rare, deliberate, audited action) and restart the api service.
4. Record the retirement (who, when, why, verification query output) in
   whatever audit/change-log process the team uses for production changes —
   E13's own `AuditService` doesn't automatically capture out-of-band file
   edits like this one.

## Swapping the secrets backend

`SecretsPort` (`apps/api/src/modules/secrets/secrets.port.ts`) is the swap
point for moving off the local `docker/secrets/local.env` file to a managed
vault (AWS Secrets Manager, Cloudflare Secrets, etc.) — see
`docs/security/secrets.md`.
