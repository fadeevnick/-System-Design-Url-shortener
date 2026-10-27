variable "aws_region" {
  description = "AWS region for Application resources."
  type        = string
  default     = "eu-central-1"
}

variable "name" {
  description = "Application EC2 name."
  type        = string
  default     = "url-shortener-compose"
}

variable "platform_state_bucket" {
  description = "S3 bucket containing Platform Terraform state."
  type        = string
}

variable "platform_state_key" {
  description = "S3 key containing Platform Terraform state."
  type        = string
  default     = "url-shortener/platform.tfstate"
}

variable "platform_state_region" {
  description = "AWS region of the Platform state bucket."
  type        = string
  default     = "eu-central-1"
}

variable "ami_id" {
  description = "Ubuntu or another SSH-accessible Linux AMI with cloud-init."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the Compose host."
  type        = string
  default     = "t3.small"
}

variable "subnet_id" {
  description = "Existing subnet for the Application EC2."
  type        = string
}

variable "security_group_ids" {
  description = "Existing security groups for the Application EC2."
  type        = list(string)
}

variable "key_name" {
  description = "EC2 key pair name."
  type        = string
  default     = null
  nullable    = true
}

variable "associate_public_ip_address" {
  description = "Use true only when direct public SSH is part of the network design."
  type        = bool
  default     = false
}

variable "root_volume_size_gb" {
  description = "Root volume size for Docker layers and logs."
  type        = number
  default     = 20
}
