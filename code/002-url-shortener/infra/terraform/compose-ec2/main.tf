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

data "terraform_remote_state" "aws_platform" {
  backend = "s3"

  config = {
    bucket = var.platform_state_bucket
    key    = var.platform_state_key
    region = var.platform_state_region
  }
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
    resources = [data.terraform_remote_state.aws_platform.outputs.ecr_repository_arn]
  }

  statement {
    sid       = "ReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.database_secret_arns
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

resource "aws_instance" "compose_host" {
  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = var.security_group_ids
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.compose_host.name
  associate_public_ip_address = var.associate_public_ip_address

  tags = {
    Name      = var.name
    Service   = "url-shortener"
    ManagedBy = "terraform"
    Runtime   = "docker-compose"
    Stack     = "application"
  }

  ebs_optimized = false

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    iops                  = var.root_volume_iops
    throughput            = var.root_volume_throughput
    encrypted             = var.root_volume_encrypted
    kms_key_id            = var.root_volume_kms_key_id
    delete_on_termination = true
  }
}
