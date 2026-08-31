# E22 — Deployment & Launch Infra

|            |                                                                 |
| ---------- | --------------------------------------------------------------- |
| Status     | todo                                                            |
| Owner      | —                                                               |
| Wave       | 4 (launch)                                                      |
| Depends on | all wave-3 epics landed; owner sign-off for VM + email accounts |
| Issue      | https://github.com/enendufrankc/verifynNG/issues/74             |

Ship the verified `docker compose` stack to production, cheapest/simplest: one small VM (Hetzner CAX21-class, ~€7/mo) behind a Cloudflare Tunnel — zero open ports; Cloudflare free tier carries DNS/TLS/CDN/DDoS for verifyproduct.app (already on CF).

Everything is IaC — OpenTofu/Terraform with the `hcloud` and `cloudflare` providers: VM, firewall, tunnel + DNS records, R2 backup bucket; cloud-init installs Docker and brings the stack up. No hand-built servers.

Tasks: production env + real secrets (E13's DEPLOYMENT_ENV=production fail-fast already refuses dev defaults) · MailerPort → Resend/Brevo with DKIM · geo port → `CF-IPCountry`/`request.cf` instead of fake-geo · nightly `pg_dump` + MinIO → R2 (10GB free) · deploy + rollback runbook · smoke check after deploy (mint → verify).

Out of scope: SMS/pay providers (features stay disabled), HA/multi-node, Cloudflare-native (Workers/Containers) rewrite — the adapter ports keep that open as a later migration, not a launch requirement.
