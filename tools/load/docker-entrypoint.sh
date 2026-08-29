#!/bin/sh
set -e

SCRIPT="$1"
if [ -z "$SCRIPT" ]; then
  echo "Usage: docker compose --profile load run k6 run /scripts/<script.js>"
  echo "Available scripts: verify.js, mint.js, public-api.js, enumeration.js"
  exit 1
fi

echo "Running k6 script: $SCRIPT"
k6 run \
  --out json=/results/"$(basename "$SCRIPT" .js)-$(date +%Y%m%dT%H%M%S).json" \
  "$SCRIPT"
