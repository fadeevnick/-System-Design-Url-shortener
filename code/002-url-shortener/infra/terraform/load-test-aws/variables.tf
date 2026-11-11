variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "name" {
  type    = string
  default = "url-shortener-load-test"
}

variable "ami_id" {
  description = "Ubuntu AMI for the k6 load generator."
  type        = string
}

variable "instance_type" {
  description = "Keep this fixed across architecture comparisons."
  type        = string
  default     = "c5.xlarge"
}

variable "subnet_id" {
  type = string
}

variable "security_group_ids" {
  type = list(string)
}

variable "associate_public_ip_address" {
  type    = bool
  default = false
}

variable "key_name" {
  type     = string
  nullable = true
  default  = null
}
