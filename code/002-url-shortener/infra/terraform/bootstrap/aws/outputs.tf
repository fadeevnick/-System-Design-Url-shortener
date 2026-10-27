output "state_bucket_name" {
  description = "S3 bucket containing Terraform state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "state_bucket_arn" {
  description = "S3 state bucket ARN."
  value       = aws_s3_bucket.terraform_state.arn
}

output "aws_account_id" {
  description = "AWS account that owns the backend resources."
  value       = data.aws_caller_identity.current.account_id
}
