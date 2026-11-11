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
    resources = [var.database_secret_arn]
  }
}

resource "aws_iam_role" "compose_host" {
  name               = "${var.name}-runtime-role"
  assume_role_policy = data.aws_iam_policy_document.compose_host_assume_role.json
  description        = "Runtime permissions for the two-host Compose experiment"
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

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public ALB for the URL shortener experiment"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from the configured test clients"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.alb_ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "compose_host" {
  name        = "${var.name}-hosts"
  description = "Security group for the two Compose application hosts"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Application traffic from the ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "SSH from the configured administration network"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_ingress_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "compose_host" {
  count = length(var.compose_subnet_ids)

  ami                         = var.ami_id
  instance_type               = var.instance_type
  subnet_id                   = var.compose_subnet_ids[count.index]
  vpc_security_group_ids      = [aws_security_group.compose_host.id]
  key_name                    = var.key_name
  iam_instance_profile        = aws_iam_instance_profile.compose_host.name
  associate_public_ip_address = var.associate_public_ip_address

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name      = "${var.name}-${count.index + 1}"
    Service   = "url-shortener"
    ManagedBy = "terraform"
    Runtime   = "docker-compose"
    Stack     = "compose-ec2-alb"
  }
}

resource "aws_lb" "url_shortener" {
  name               = substr(var.name, 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.alb_subnet_ids

  tags = {
    Name      = var.name
    Service   = "url-shortener"
    ManagedBy = "terraform"
  }
}

resource "aws_lb_target_group" "url_shortener" {
  name        = substr("${var.name}-tg", 0, 32)
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = var.vpc_id

  deregistration_delay = 30

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group_attachment" "compose_host" {
  count            = length(aws_instance.compose_host)
  target_group_arn = aws_lb_target_group.url_shortener.arn
  target_id        = aws_instance.compose_host[count.index].id
  port             = 3000
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.url_shortener.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.url_shortener.arn
  }
}
