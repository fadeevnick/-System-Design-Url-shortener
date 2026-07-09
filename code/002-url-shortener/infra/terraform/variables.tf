variable "gcp_project" {
  description = "GCP project id."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.gcp_project))
    error_message = "gcp_project must be a real GCP project id, for example my-project-123. It cannot contain underscores."
  }
}

variable "gcp_region" {
  description = "GCP region for Cloud SQL."
  type        = string
  default     = "europe-west1"
}

variable "db_instance_name" {
  description = "Cloud SQL instance name."
  type        = string
  default     = "url-shortener-db"
}

variable "db_version" {
  description = "Cloud SQL PostgreSQL version."
  type        = string
  default     = "POSTGRES_16"
}

variable "db_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-f1-micro"
}

variable "db_edition" {
  description = "Cloud SQL edition. Use ENTERPRISE for small shared-core tiers like db-f1-micro."
  type        = string
  default     = "ENTERPRISE"
}

variable "db_disk_size_gb" {
  description = "Initial SSD disk size in GB."
  type        = number
  default     = 10
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "url_shortener"
}

variable "db_user" {
  description = "Application database user."
  type        = string
  default     = "url_shortener"
}

variable "authorized_networks" {
  description = "Public IP ranges allowed to connect to Cloud SQL."
  type = list(object({
    name  = string
    value = string
  }))
}

variable "deletion_protection" {
  description = "Protect Cloud SQL instance from accidental terraform destroy."
  type        = bool
  default     = false
}
