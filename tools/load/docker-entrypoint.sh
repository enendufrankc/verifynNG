#!/bin/sh
set -e

SCRIPT="$1"
if [ -z "$SCRIPT" ]; then
  echo "Usage: docker compose --profile load run k6 run /scripts/<script.js>"
  echo "Available scripts: verify.js, anomaly.js, mint.js, public-api.js, enumeration.js"
  exit 1
fi

echo "Running k6 script: $SCRIPT"

# The named `load-results` volume is created root-owned on first use in a
# fresh worktree/environment, but the k6 image runs as an unprivileged user
# — writing --out json into it then fails with EACCES and k6 exits non-zero
# even though the actual load test ran fine. Degrade to stdout-only output
# instead of failing the whole run over an unwritable results directory.
if [ -w /results ]; then
  k6 run \
    --out json=/results/"$(basename "$SCRIPT" .js)-$(date +%Y%m%dT%H%M%S).json" \
    "$SCRIPT"
else
  echo "warning: /results is not writable by this user — skipping --out json, results print to stdout only" >&2
  k6 run "$SCRIPT"
fi
