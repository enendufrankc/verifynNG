data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Latest Ubuntu 24.04 ARM image for A1.
data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_instance" "app" {
  compartment_id      = var.tenancy_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  display_name        = "verifynng-prod"
  shape               = "VM.Standard.A1.Flex"

  # The full Always Free allowance: 4 OCPU / 24 GB.
  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = 100
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.main.id
    assign_public_ip = true
    hostname_label   = "verifynng"
  }

  # Run Command is the ops channel: outbound SSH is unreliable on some
  # networks (banner-dropping middleboxes), and this works through OCI's API.
  agent_config {
    plugins_config {
      name          = "Compute Instance Run Command"
      desired_state = "ENABLED"
    }
    plugins_config {
      name          = "Compute Instance Monitoring"
      desired_state = "ENABLED"
    }
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      github_deploy_key = var.github_deploy_key_private
      production_env    = var.production_env
      tunnel_token      = cloudflare_zero_trust_tunnel_cloudflared.app.tunnel_token
    }))
  }

  # Replacing the VM must never be a silent side effect of an apply — it holds
  # the database. Recreate only via explicit taint after backups are verified.
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [source_details, metadata]
  }
}

output "instance_public_ip" {
  value = oci_core_instance.app.public_ip
}
