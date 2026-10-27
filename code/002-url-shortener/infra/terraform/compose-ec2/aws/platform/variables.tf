variable "aws_region" {
  description = "AWS region for Platform resources."
  type        = string
  default     = "eu-central-1"
}

variable "name" {
  description = "Stable name prefix for Platform resources."
  type        = string
  default     = "url-shortener-compose"
}

variable "ecr_repository_name" {
  description = "ECR repository name for the application image."
  type        = string
  default     = "url-shortener"
}

variable "database_secret_arn" {
  description = "Secrets Manager ARN containing database credentials."
  type        = string
  default     = null
  nullable    = true
}
