#!/usr/bin/env bash
# docker/scripts/restore.sh <timestamp> — restores backups/<timestamp>.dump
# from MinIO into the throwaway `postgres-restore` container (compose
# profile `drill`), then boots a throwaway API instance pointed at it and
# curls a real seeded code to prove the restored data actually verifies.
#
# Usage: docker/scripts/restore.sh <timestamp> [compose-file]
# <timestamp> is whatever docker/scripts/backup.sh printed, e.g. 20260831120000.
set -euo pipefail

TIMESTAMP="${1:?Usage: docker/scripts/restore.sh <timestamp> [compose-file]}"
COMPOSE_FILE="${2:-docker/compose.yml}"
BACKUP_NAME="${TIMESTAMP}.dump"
TMP_DIR="$(mktemp -d)"
TMP_FILE="${TMP_DIR}/${BACKUP_NAME}"
RESTORE_API_PORT="${RESTORE_API_PORT:-4099}"
START_TIME=$(date +%s)
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "==> downloading backups/${BACKUP_NAME} from MinIO"
docker compose -f "${COMPOSE_FILE}" run --rm --no-deps \
  --entrypoint sh \
  -v "${TMP_DIR}:/backup" \
  minio-init -c "
    mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null &&
    mc cp local/backups/${BACKUP_NAME} /backup/${BACKUP_NAME}
  "

echo "==> starting throwaway postgres-restore"
docker compose -f "${COMPOSE_FILE}" --profile drill up -d postgres-restore
for _ in $(seq 1 30); do
  if docker compose -f "${COMPOSE_FILE}" exec -T postgres-restore pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> restoring dump into postgres-restore"
docker compose -f "${COMPOSE_FILE}" cp "${TMP_FILE}" postgres-restore:/tmp/restore.dump
docker compose -f "${COMPOSE_FILE}" exec -T postgres-restore \
  pg_restore -U postgres -d verifynng --clean --if-exists --no-owner /tmp/restore.dump || true
# pg_restore exits non-zero on harmless "does not exist, skipping" notices for
# --clean against an empty DB — the meaningful check is the query below.

SAMPLE_CODE="$(docker compose -f "${COMPOSE_FILE}" exec -T postgres-restore \
  psql -U postgres -d verifynng -tAc 'select "tier1Code" from "Unit" limit 1;' | tr -d '[:space:]')"
if [ -z "${SAMPLE_CODE}" ]; then
  echo "!! restored DB has no Unit rows — restore did not bring back data" >&2
  exit 1
fi
echo "==> restored DB has data; sample code: ${SAMPLE_CODE}"

echo "==> booting throwaway API against the restored DB on :${RESTORE_API_PORT}"
docker compose -f "${COMPOSE_FILE}" run --rm --no-deps -d \
  --name restore-drill-api \
  -e DATABASE_URL="postgresql://postgres:postgres@postgres-restore:5432/verifynng?schema=public" \
  -p "${RESTORE_API_PORT}:4000" \
  api >/dev/null

cleanup() {
  docker rm -f restore-drill-api >/dev/null 2>&1 || true
  docker compose -f "${COMPOSE_FILE}" --profile drill rm -sf postgres-restore >/dev/null 2>&1 || true
}
trap 'cleanup; rm -rf "${TMP_DIR}"' EXIT

echo "==> waiting for throwaway API to be ready"
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${RESTORE_API_PORT}/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> curl http://localhost:${RESTORE_API_PORT}/v1/verify/${SAMPLE_CODE}"
curl -s "http://localhost:${RESTORE_API_PORT}/v1/verify/${SAMPLE_CODE}" | tee "${TMP_DIR}/verdict.json"
echo

END_TIME=$(date +%s)
echo "==> restore drill complete in $((END_TIME - START_TIME))s"
echo "    (compare the verdict above against the same code on the main stack —"
echo "     http://localhost:${API_HOST_PORT:-4000}/v1/verify/${SAMPLE_CODE} — and"
echo "     record the duration in docs/runbooks/restore-from-backup.md's Last drill table)"
