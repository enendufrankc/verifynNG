data "cloudflare_zone" "main" {
  name = var.domain
}

resource "random_id" "tunnel_secret" {
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "app" {
  account_id = var.cloudflare_account_id
  name       = "verifynng-prod"
  secret     = random_id.tunnel_secret.b64_std
}

# All three hostnames terminate at Cloudflare's edge and ride the tunnel to
# the docker network — the VM has zero app ingress.
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "app" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.app.id

  config {
    ingress_rule {
      hostname = var.domain
      service  = "http://web-verify:3000"
    }
    ingress_rule {
      hostname = "www.${var.domain}"
      service  = "http://web-verify:3000"
    }
    ingress_rule {
      hostname = "admin.${var.domain}"
      service  = "http://web-admin:3001"
    }
    ingress_rule {
      hostname = "api.${var.domain}"
      service  = "http://api:4000"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "apex" {
  zone_id = data.cloudflare_zone.main.id
  name    = "@"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.app.id}.cfargotunnel.com"
  proxied = true
}

resource "cloudflare_record" "admin" {
  zone_id = data.cloudflare_zone.main.id
  name    = "admin"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.app.id}.cfargotunnel.com"
  proxied = true
}

resource "cloudflare_record" "api" {
  zone_id = data.cloudflare_zone.main.id
  name    = "api"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.app.id}.cfargotunnel.com"
  proxied = true
}

# Nightly pg_dump + MinIO mirror land here (free 10 GB).
resource "cloudflare_r2_bucket" "backups" {
  account_id = var.cloudflare_account_id
  name       = "verifynng-backups"
  location   = "WEUR"
}

resource "cloudflare_record" "www" {
  zone_id = data.cloudflare_zone.main.id
  name    = "www"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.app.id}.cfargotunnel.com"
  proxied = true
}
