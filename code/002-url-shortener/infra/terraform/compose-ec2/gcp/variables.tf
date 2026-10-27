variable "project_id" {
  description = "GCP project that owns the Compute Engine instance."
  type        = string
}

variable "region" {
  description = "GCP region for provider defaults."
  type        = string
  default     = "europe-west1"
}

variable "zone" {
  description = "GCP zone where the Compose host will run."
  type        = string
  default     = "europe-west1-b"
}

variable "instance_name" {
  description = "Compute Engine instance name."
  type        = string
  default     = "url-shortener-compose"
}

variable "machine_type" {
  description = "Compute Engine machine type."
  type        = string
  default     = "e2-medium"
}

variable "source_image" {
  description = "Boot image self-link or family reference."
  type        = string
  default     = "ubuntu-os-cloud/ubuntu-2204-lts"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB."
  type        = number
  default     = 20
}

variable "subnetwork" {
  description = "Subnetwork name or self-link for the VM network interface."
  type        = string
}

variable "assign_public_ip" {
  description = "Assign an ephemeral public IP for direct Ansible SSH."
  type        = bool
  default     = true
}

variable "service_account_email" {
  description = "Optional service account email for registry or cloud API access."
  type        = string
  default     = null
  nullable    = true
}

variable "network_tags" {
  description = "VPC firewall tags, for example ssh and http."
  type        = list(string)
  default     = ["url-shortener-compose"]
}
