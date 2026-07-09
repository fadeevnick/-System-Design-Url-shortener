terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}

resource "random_password" "db_password" {
  length  = 24
  special = true
}

resource "google_sql_database_instance" "url_shortener" {
  name             = var.db_instance_name
  database_version = var.db_version
  region           = var.gcp_region

  settings {
    tier              = var.db_tier
    edition           = var.db_edition
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.db_disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled    = false
    }

    ip_configuration {
      ipv4_enabled = true

      dynamic "authorized_networks" {
        for_each = var.authorized_networks

        content {
          name  = authorized_networks.value.name
          value = authorized_networks.value.value
        }
      }
    }
  }

  deletion_protection = var.deletion_protection
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.url_shortener.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.url_shortener.name
  password = random_password.db_password.result
}
