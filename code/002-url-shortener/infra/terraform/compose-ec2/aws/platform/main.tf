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

  dynamic "statement" {
    for_each = var.database_secret_arn == null ? [] : [var.database_secret_arn]

    content {
      sid       = "ReadDatabaseSecret"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
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
