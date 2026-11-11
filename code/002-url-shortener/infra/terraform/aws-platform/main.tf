terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_ecr_repository" "url_shortener" {
  name                 = var.ecr_repository_name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

}

resource "aws_db_instance" "url_shortener" {
  allocated_storage                     = 100
  apply_immediately                     = null
  auto_minor_version_upgrade            = true
  availability_zone                     = var.database_availability_zone
  backup_retention_period               = 0
  backup_target                         = "region"
  backup_window                         = "01:07-01:37"
  ca_cert_identifier                    = "rds-ca-rsa2048-g1"
  copy_tags_to_snapshot                 = false
  database_insights_mode                = "standard"
  db_name                               = "url_shortener"
  db_subnet_group_name                  = var.database_subnet_group_name
  delete_automated_backups              = true
  deletion_protection                   = false
  engine                                = "postgres"
  engine_lifecycle_support              = "open-source-rds-extended-support"
  engine_version                        = "18.3"
  iam_database_authentication_enabled   = false
  identifier                            = var.database_identifier
  instance_class                        = var.database_instance_class
  kms_key_id                            = var.database_kms_key_id
  license_model                         = "postgresql-license"
  maintenance_window                    = "wed:04:17-wed:04:47"
  max_allocated_storage                 = 0
  multi_az                              = false
  network_type                          = "IPV4"
  option_group_name                     = "default:postgres-18"
  parameter_group_name                  = "default.postgres18"
  performance_insights_enabled          = false
  performance_insights_retention_period = 0
  port                                  = 5432
  publicly_accessible                   = true
  skip_final_snapshot                   = true
  storage_encrypted                     = true
  storage_throughput                    = 125
  storage_type                          = "gp3"
  iops                                  = 3000
  username                              = "url_shortener"
  vpc_security_group_ids                = var.database_security_group_ids
}
