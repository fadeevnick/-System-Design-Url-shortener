output "ecr_repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.url_shortener.name
}

output "ecr_repository_url" {
  description = "ECR repository URL used by CI and Ansible."
  value       = aws_ecr_repository.url_shortener.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN."
  value       = aws_ecr_repository.url_shortener.arn
}

output "instance_profile_name" {
  description = "Instance profile consumed by the Application stack."
  value       = aws_iam_instance_profile.compose_host.name
}

output "runtime_role_arn" {
  description = "Runtime IAM role ARN."
  value       = aws_iam_role.compose_host.arn
}
