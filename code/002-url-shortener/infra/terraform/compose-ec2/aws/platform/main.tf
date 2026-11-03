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

data "aws_iam_policy_document" "compose_host_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "compose_host_runtime" {
  statement {
    sid       = "EcrAuthorization"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.url_shortener.arn]
  }

  statement {
    sid       = "ReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [
      var.m7g_xlarge_database_secret_arn,
      var.m7g_2xlarge_database_secret_arn,
    ]
  }
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

resource "aws_iam_role" "compose_host" {
  name               = "${var.name}-runtime-role"
  assume_role_policy = data.aws_iam_policy_document.compose_host_assume_role.json
  description        = "Runtime permissions for the URL shortener Compose host"
}

resource "aws_iam_role_policy" "compose_host_runtime" {
  name   = "${var.name}-runtime-policy"
  role   = aws_iam_role.compose_host.id
  policy = data.aws_iam_policy_document.compose_host_runtime.json
}

resource "aws_iam_instance_profile" "compose_host" {
  name = "${var.name}-profile"
  role = aws_iam_role.compose_host.name
}

resource "aws_db_instance" "url_shortener" {
  allocated_storage                     = 100
  allow_major_version_upgrade           = null
  apply_immediately                     = null
  auto_minor_version_upgrade            = true
  availability_zone                     = "eu-central-1b"
  backup_retention_period               = 0
  backup_target                         = "region"
  backup_window                         = "01:07-01:37"
  ca_cert_identifier                    = "rds-ca-rsa2048-g1"
  copy_tags_to_snapshot                 = false
  custom_iam_instance_profile           = null
  customer_owned_ip_enabled             = false
  database_insights_mode                = "standard"
  db_name                               = "url_shortener"
  db_subnet_group_name                  = "url-shortener-public-db-subnet-group"
  dedicated_log_volume                  = false
  delete_automated_backups              = true
  deletion_protection                   = false
  domain                                = null
  domain_auth_secret_arn                = null
  domain_iam_role_name                  = null
  domain_ou                             = null
  enabled_cloudwatch_logs_exports       = []
  engine                                = "postgres"
  engine_lifecycle_support              = "open-source-rds-extended-support"
  engine_version                        = "18.3"
  final_snapshot_identifier             = null
  iam_database_authentication_enabled   = false
  identifier                            = "url-shortener-db-m7g-2xlarge"
  instance_class                        = "db.m7g.2xlarge"
  iops                                  = 3000
  kms_key_id                            = "arn:aws:kms:eu-central-1:075483720790:key/cfbf09e3-bb99-4e1a-8146-c3ae08dd09b6"
  license_model                         = "postgresql-license"
  maintenance_window                    = "wed:04:17-wed:04:47"
  manage_master_user_password           = null
  max_allocated_storage                 = 0
  monitoring_interval                   = 0
  multi_az                              = false
  network_type                          = "IPV4"
  option_group_name                     = "default:postgres-18"
  parameter_group_name                  = "default.postgres18"
  password                              = null # sensitive
  password_wo                           = null # sensitive
  password_wo_version                   = null
  performance_insights_enabled          = false
  performance_insights_retention_period = 0
  port                                  = 5432
  publicly_accessible                   = true
  replicate_source_db                   = null
  skip_final_snapshot                   = true
  storage_encrypted                     = true
  storage_throughput                    = 125
  storage_type                          = "gp3"
  tags                                  = {}
  tags_all                              = {}
  upgrade_storage_config                = null
  username                              = "url_shortener"
  vpc_security_group_ids                = ["sg-032c541f97f103eb4"]
}
