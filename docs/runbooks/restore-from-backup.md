# Runbook: Restore From Backup

**This is the one runbook that must never stay theoretical.** It's tested by
running it, not by reading it — see "Last drill" below and E21's nightly
schedule.

## 1. Trigger

- Data loss or corruption on the primary Postgres instance.
- Rehearsing disaster recovery (the nightly drill, or before this runbook
  changes).

## 2. Procedure

### Take a backup

```bash
docker/scripts/backup.sh
```

`pg_dump -Fc` the compose stack's `postgres` service and uploads it to the
`backups` MinIO bucket as `backups/<UTC timestamp>.dump`. Prints the
timestamp on its last line — that's the argument `restore.sh` needs.

### Restore and verify it

```bash
docker/scripts/restore.sh <timestamp>
```

This is non-destructive to the running stack — it never touches the primary
`postgres` container. It:

1. Downloads `backups/<timestamp>.dump` from MinIO.
2. Starts the throwaway `postgres-restore` container (compose profile
   `drill`, port `${POSTGRES_RESTORE_PORT:-5433}`) and `pg_restore`s the dump
   into it.
3. Picks a real `tier1Code` out of the _restored_ data (not a hardcoded
   fixture — proves the restore actually has data, not just that the command
   exited 0).
4. Boots a throwaway API container pointed at the restored database on
   `:4099` and curls `/v1/verify/<that code>`.
5. Tears down both throwaway containers, leaving the primary stack
   untouched.

### Verify by hand

Compare the printed verdict against the same code on the real stack:

```bash
curl http://localhost:${API_HOST_PORT:-4000}/v1/verify/<the code the script printed>
```

Same `verdict`, `severity`, `product`, `batch` — the restore is good.

## 3. Diagnosis if it fails

- **`restore.sh` exits with "restored DB has no Unit rows"**: the backup was
  empty or corrupt — check the timestamp argument, and check `backup.sh`'s
  own output when it was taken (a `pg_dump` that failed silently is the most
  likely cause; the script doesn't currently check the dump file is
  non-empty before uploading — a good hardening follow-up).
- **`pg_restore` prints errors about missing extensions/roles**: this
  compose stack's Postgres image is stock `postgres:16-alpine` — a dump
  taken against a differently-configured Postgres (extra extensions) won't
  restore cleanly here. Not expected in this local stack; would matter in a
  real deployment.
- **Verdict differs from the main stack**: first suspect is the signing key
  ring (`CORE_KEYS`) — the restored data must be read by an API instance
  configured with the _same_ key ring that minted it, or checksums will
  legitimately fail (see the comment in
  `packages/db/prisma/seed/e05-oem.ts`, the same gotcha that would trip up a
  hand-run of `pnpm db:seed` outside Docker while comparing against the
  dockerized `api` service's hardcoded dev key in `docker/compose.yml`).

## 4. Restoring the real primary (actual disaster, not a drill)

This runbook's scripts intentionally never touch the primary `postgres`
container — a drill must be safe to run against a live stack. An actual
restore-in-place is a deliberate, separate action:

```bash
docker compose -f docker/compose.yml stop api api-worker
docker compose -f docker/compose.yml exec -T postgres \
  pg_restore -U postgres -d verifynng --clean --if-exists /path/to/dump
docker compose -f docker/compose.yml start api api-worker
```

Take a fresh `backup.sh` snapshot of the _current_ (possibly-corrupted) state
before doing this, in case the restore target turns out to be wrong.

## 5. Last drill

| Date (UTC) | Trigger                                  | Duration                      | Result                                                                                                          |
| ---------- | ---------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 2026-08-31 | E18 verification (manual, this worktree) | 11s (repeat run, warm images) | Pass — restored `ivoryglow.1.k1.…` verified identical (`verdict: ok`, same product/batch) to the primary stack. |

E21 schedules this nightly against its own stack (see
`docs/epics/CROSS-EPIC-REQUESTS.md` "To E21 Quality Engineering" — nightly
restore drill using these exact scripts) and appends a row here each run.
