# Production deploy runbook — verifyproduct.app

One Oracle Always Free VM (uk-london-1, A1.Flex 4 OCPU/24GB) running the
compose stack, reached only through a Cloudflare Tunnel. Total cost: $0/mo.
Everything below is IaC (`infra/`, OpenTofu) plus this runbook.

## One-time prerequisites (owner)

| What | Where |
|---|---|
| OCI CLI authenticated | `~/.oci/config` (done 2026-09-09) |
| Cloudflare API token | dashboard → My Profile → API Tokens: Zone.DNS:Edit on verifyproduct.app + Account.Cloudflare Tunnel:Edit + Account.Workers R2 Storage:Edit → export as `CLOUDFLARE_API_TOKEN` |
| Resend | domain verifyproduct.app added + DKIM records (Resend shows two CNAMEs; add in Cloudflare DNS, grey-cloud) → API key into secrets file |
| R2 API credentials | dashboard → R2 → Manage API tokens (Object Read & Write on verifynng-backups) → into secrets file |
| GitHub deploy key | `ssh-keygen -t ed25519 -f deploy_key -N ''` → public half: repo → Settings → Deploy keys (read-only); private half into `secrets.auto.tfvars` |
| Production secrets | `scripts/deploy/gen-secrets.sh > /tmp/prod.env`, fill the FILL_ME lines, store the whole file in the password manager (this is the `CORE_KEYS` backup — losing it invalidates every printed QR), paste into `secrets.auto.tfvars`, shred temp file |

`infra/secrets.auto.tfvars` (gitignored) shape:

```hcl
tenancy_ocid              = "ocid1.tenancy.oc1..…"
cloudflare_account_id     = "…"
admin_cidr                = "<your-ip>/32"
ssh_public_key            = "ssh-ed25519 AAAA…"
github_deploy_key_private = <<EOT
-----BEGIN OPENSSH PRIVATE KEY-----
…
EOT
production_env            = <<EOT
<contents of the gen-secrets output>
EOT
```

## Deploy from nothing

```bash
cd infra
tofu init
tofu apply        # VM + VCN + tunnel + DNS + R2; ~5 min
```

- **"Out of host capacity"** on the instance: free A1 stock varies per AD.
  Set `availability_domain_index = 1` (then 2) in secrets.auto.tfvars and
  re-apply. If all three ADs are dry, retry later (stock returns) — or fall
  back to Hetzner (swap the instance/network files for `hcloud` equivalents;
  the tunnel/DNS/R2 half is unchanged).
- cloud-init then clones the repo and starts `verifynng.service`; first boot
  builds the images on the VM (~10 min on 4 OCPU).

## Verify the deploy (every deploy)

```bash
curl -s https://api.verifyproduct.app/health
open https://verifyproduct.app          # verify page loads
open https://admin.verifyproduct.app    # login page loads
```

Then the real smoke: log into admin, mint a 5-unit batch, scan/enter one
tier-1 code on verifyproduct.app → verdict `ok`; check the batch-minted email
arrived (Resend dashboard → Logs).

## Operating the VM without SSH (serial console)

Outbound SSH is unreliable from some networks (banner-dropping middleboxes)
and Ubuntu's Oracle agent ignores Run Command. The dependable path is the
**serial console**: `oci compute instance-console-connection create` with an
RSA key (ed25519 is rejected), then SSH via the printed ProxyCommand (port
443) and log in as `ubuntu` with the console password from cloud-init
(`~/.verifynng-console-pw` on the deploy machine). `/tmp/run-console.sh`
pattern: expect-driven, one command per call.

Moving files onto the VM: upload to the R2 backups bucket, then pull with the
aws-cli container using the R2 creds already in `.env.production` (this is
how the 10k pre-minted batch was imported: `scripts/deploy/import-preminted.mjs`
copied into the api container and run from `/app/apps/api`).

Cutover gotchas hit on 2026-09-09: the landing Worker's custom domains had to
be deleted via the Workers API (`wrangler triggers deploy` does not remove
them) before the tunnel CNAMEs could be created, and the edge cache served the
old page until a `purge_everything`.

## Update to a new version

```bash
ssh ubuntu@<instance_public_ip>   # from the admin IP only
cd /opt/verifynng/app && sudo git pull && sudo systemctl restart verifynng
```

## Backups / restore

- Nightly `scripts/deploy/backup.sh` (cron.daily): pg_dump + MinIO → R2
  `verifynng-backups` (set a 14-day lifecycle rule on the bucket once).
- Restore: fresh `tofu apply`, then
  `gunzip -c db-YYYYMMDD.sql.gz | docker compose … exec -T postgres psql -U postgres verifynng`
  and `aws s3 sync s3://verifynng-backups/minio/ /data` into the minio volume.
- The **production secrets file in the password manager** is part of every
  restore — same keys or all printed codes and stored hashes are dead.

## Explicitly out (launch posture)

- Payments: `PAYMENT_GATEWAY=fake` (billing UI works, no real charges) until
  Paystack keys exist.
- Captcha: `CAPTCHA_PROVIDER=fake` until Turnstile (free) is configured.
- SMS/WhatsApp: fake adapters; features dormant.
- CI: GitHub Actions still billing-locked; the deploy gate is this runbook's
  smoke test + the pre-push hook.
