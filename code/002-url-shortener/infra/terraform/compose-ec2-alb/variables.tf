variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "name" {
  type    = string
  default = "url-shortener-compose-alb"
}

variable "platform_state_bucket" {
  type = string
}

variable "platform_state_key" {
  type    = string
  default = "url-shortener/aws-platform.tfstate"
}

variable "platform_state_region" {
  type    = string
  default = "eu-central-1"
}

variable "database_secret_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "alb_subnet_ids" {
  type = list(string)

  validation {
    condition     = length(var.alb_subnet_ids) >= 2
    error_message = "Provide at least two ALB subnets in different AZs."
  }
}

variable "compose_subnet_ids" {
  type = list(string)

  validation {
    condition     = length(var.compose_subnet_ids) == 2
    error_message = "This experiment requires exactly two Compose host subnets."
  }
}

variable "ami_id" {
  type = string
}

variable "instance_type" {
  description = "Two c7i.large hosts used by the current experiment."
  type        = string
  default     = "c7i.large"
}

variable "key_name" {
  type     = string
  nullable = true
  default  = null
}

variable "associate_public_ip_address" {
  type    = bool
  default = true
}

variable "ssh_ingress_cidr_blocks" {
  type = list(string)
}

variable "alb_ingress_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "root_volume_size_gb" {
  type    = number
  default = 20
}
