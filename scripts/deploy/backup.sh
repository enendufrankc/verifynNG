#!/bin/bash
# Nightly backup: pg_dump + MinIO data → R2. Symlinked into /etc/cron.daily
# by cloud-init. Retention: R2 keeps 14 days via object lifecycle (set once in
# the dashboard) — this script only uploads.
set -euo pipefail

ENV_FILE=/opt/verifynng/.env.production
APP_DIR=/opt/verifynng/app
STAMP=$(date -u +%Y%m%d)
COMPOSE="docker compose -f docker/compose.yml -f docker/compose.prod.yml --env-file $ENV_FILE"

set -a; source "$ENV_FILE"; set +a
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

cd "$APP_DIR"

# Postgres: full dump, compressed.
$COMPOSE exec -T postgres pg_dump -U postgres verifynng | gzip > "/tmp/db-${STAMP}.sql.gz"
docker run --rm -v /tmp:/backup -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  amazon/aws-cli:latest s3 cp "/backup/db-${STAMP}.sql.gz" \
  "s3://verifynng-backups/db/db-${STAMP}.sql.gz" --endpoint-url "$ENDPOINT" --only-show-errors
rm -f "/tmp/db-${STAMP}.sql.gz"

# MinIO (manifests, exports, report photos, DSAR exports): sync the volume.
docker run --rm --volumes-from "$($COMPOSE ps -q minio)" \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY amazon/aws-cli:latest \
  s3 sync /data "s3://verifynng-backups/minio/" --endpoint-url "$ENDPOINT" --only-show-errors

echo "backup ${STAMP} ok"
