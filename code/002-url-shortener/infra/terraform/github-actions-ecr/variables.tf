variable "aws_region" {
  description = "AWS region for the GitHub Actions IAM integration."
  type        = string
  default     = "eu-central-1"
}

variable "github_repository" {
  description = "GitHub repository in owner/name format."
  type        = string
  default     = "fadeevnick/-System-Design-Url-shortener"
}

variable "github_tag_pattern" {
  description = "Allowed GitHub tag pattern for the OIDC subject."
  type        = string
  default     = "v*"
}

variable "github_actions_role_name" {
  description = "IAM role assumed by the GitHub Actions tag workflow."
  type        = string
  default     = "github-actions-url-shortener-ecr"
}

variable "platform_state_bucket" {
  description = "S3 bucket containing the aws-platform Terraform state."
  type        = string
}

variable "platform_state_key" {
  description = "Key of the aws-platform Terraform state."
  type        = string
  default     = "url-shortener/aws-platform.tfstate"
}

variable "platform_state_region" {
  description = "AWS region containing the aws-platform state bucket."
  type        = string
  default     = "eu-central-1"
}
