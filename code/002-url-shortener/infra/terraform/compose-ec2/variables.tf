variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "name" {
  type    = string
  default = "url-shortener-compose"
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

variable "database_secret_arns" {
  description = "Existing Secrets Manager ARNs read by the Compose host."
  type        = list(string)
}

variable "ami_id" {
  type = string
}

variable "instance_type" {
  description = "Current baseline size; keep fixed for the architecture comparison."
  type        = string
  default     = "c7i.2xlarge"
}

variable "subnet_id" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
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

variable "root_volume_size_gb" {
  type    = number
  default = 20
}

variable "root_volume_iops" {
  type    = number
  default = 3000
}

variable "root_volume_throughput" {
  type    = number
  default = 125
}

variable "root_volume_encrypted" {
  type    = bool
  default = true
}

variable "root_volume_kms_key_id" {
  type     = string
  default  = null
  nullable = true
}
