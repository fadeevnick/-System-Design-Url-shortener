variable "aws_region" {
  description = "AWS region for shared platform resources."
  type        = string
  default     = "eu-central-1"
}

variable "ecr_repository_name" {
  description = "Shared immutable ECR repository for the application image."
  type        = string
  default     = "url-shortener"
}

variable "database_identifier" {
  description = "Existing or new RDS instance identifier."
  type        = string
  default     = "url-shortener-db-m7g-xlarge"
}

variable "database_instance_class" {
  description = "RDS class kept constant while comparing compute architectures."
  type        = string
  default     = "db.m7g.xlarge"
}

variable "database_availability_zone" {
  description = "Availability zone for the lab database."
  type        = string
  default     = "eu-central-1b"
}

variable "database_subnet_group_name" {
  description = "Existing RDS subnet group."
  type        = string
  default     = "url-shortener-public-db-subnet-group"
}

variable "database_security_group_ids" {
  description = "Existing security groups for RDS."
  type        = list(string)
}

variable "database_kms_key_id" {
  description = "KMS key used for RDS storage encryption."
  type        = string
}
