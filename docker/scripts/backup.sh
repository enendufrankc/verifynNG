#!/usr/bin/env bash
# docker/scripts/backup.sh — pg_dump the running compose stack's Postgres and
# upload it to the `backups` MinIO bucket as `backups/<timestamp>.dump`.
#
# Usage: docker/scripts/backup.sh [compose-file]
# Run from the repo root (or any worktree root — it uses that worktree's own
# .env-scoped compose project automatically, same as any other `docker
# compose` command here).
set -euo pipefail

COMPOSE_FILE="${1:-docker/compose.yml}"
TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
BACKUP_NAME="${TIMESTAMP}.dump"
TMP_DIR="$(mktemp -d)"
TMP_FILE="${TMP_DIR}/${BACKUP_NAME}"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "==> pg_dump'ing verifynng to ${TMP_FILE}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U postgres -Fc -d verifynng >"${TMP_FILE}"

echo "==> uploading to MinIO bucket backups/${BACKUP_NAME}"
docker compose -f "${COMPOSE_FILE}" run --rm --no-deps \
  --entrypoint sh \
  -v "${TMP_DIR}:/backup:ro" \
  minio-init -c "
    mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null &&
    mc mb local/backups >/dev/null 2>&1 || true;
    mc cp /backup/${BACKUP_NAME} local/backups/${BACKUP_NAME}
  "

echo "==> done: backups/${BACKUP_NAME} ($(du -h "${TMP_FILE}" | cut -f1))"
echo "${BACKUP_NAME}"
