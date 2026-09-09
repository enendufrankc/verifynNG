resource "oci_core_vcn" "main" {
  compartment_id = var.tenancy_ocid
  display_name   = "verifynng"
  cidr_blocks    = ["10.0.0.0/16"]
  dns_label      = "verifynng"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "verifynng-igw"
}

resource "oci_core_route_table" "main" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "verifynng-rt"
  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

# No app ingress at all — the Cloudflare Tunnel dials out. Only SSH from the
# admin IP gets in.
resource "oci_core_security_list" "main" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "verifynng-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    protocol = "6" # TCP
    source   = var.admin_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }
}

resource "oci_core_subnet" "main" {
  compartment_id    = var.tenancy_ocid
  vcn_id            = oci_core_vcn.main.id
  display_name      = "verifynng-subnet"
  cidr_block        = "10.0.1.0/24"
  route_table_id    = oci_core_route_table.main.id
  security_list_ids = [oci_core_security_list.main.id]
  dns_label         = "app"
}
