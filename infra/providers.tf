# E22 — production infra. OCI auth comes from ~/.oci/config (DEFAULT profile,
# set up via `oci setup config`). Cloudflare needs an API token in
# CLOUDFLARE_API_TOKEN with Zone.DNS:Edit + Account.Cloudflare Tunnel:Edit +
# Account.Workers R2 Storage:Edit on the verifyproduct.app zone/account —
# wrangler's OAuth login is CLI-only and not usable by this provider.
terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "oci" {
  region = var.oci_region
}

provider "cloudflare" {}
