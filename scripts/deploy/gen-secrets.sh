#!/bin/bash
# Generates the production secret set once, as .env fragment on stdout.
# Run:  scripts/deploy/gen-secrets.sh > /tmp/verifynng-prod-secrets.env
# Then: 1) store the whole file in the password manager (this IS the backup —
#          CORE_KEYS signs every printed QR code; losing it invalidates all
#          printed stock), 2) paste into infra/secrets.auto.tfvars as
#          production_env, 3) shred the temp file.
set -euo pipefail

hex32() { openssl rand -hex 32; }

KID="p1"
CORE_SECRET=$(hex32)

cat <<EOF
DEPLOYMENT_ENV=production
JWT_KEYS=${KID}:$(hex32)
JWT_ACTIVE_KID=${KID}
CORE_KEYS=${KID}:${CORE_SECRET}
CORE_ACTIVE_KID=${KID}
CORE_KEYS_JSON='{"active":"${KID}","keys":{"${KID}":"${CORE_SECRET}"}}'
CSP_REPORT_ONLY=false
MFA_ENC_KEY=$(hex32)
MANIFEST_ENC_KEY=$(hex32)
BILLING_PAYMENT_METHOD_ENC_KEY=$(hex32)
SSO_CLIENT_SECRET_ENC_KEY=$(hex32)
WEBHOOK_SECRET_ENC_KEY=$(hex32)
PAGE_REVALIDATE_SECRET=$(hex32)
CONSENT_SALT=$(hex32)
IP_HASH_SALT=$(hex32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
S3_ACCESS_KEY=verifynng-prod
S3_SECRET_KEY=$(openssl rand -hex 24)
# Fill these two in by hand:
RESEND_API_KEY=re_FILL_ME
# R2 credentials for nightly backups (Cloudflare dashboard → R2 → API tokens):
R2_ACCOUNT_ID=FILL_ME
R2_ACCESS_KEY_ID=FILL_ME
R2_SECRET_ACCESS_KEY=FILL_ME
EOF
