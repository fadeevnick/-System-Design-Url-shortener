output "github_actions_role_arn" {
  description = "Put this value into the GitHub AWS_ROLE_TO_ASSUME secret."
  value       = aws_iam_role.github_actions_ecr.arn
}

output "github_actions_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github_actions.arn
}

output "ecr_repository_arn" {
  value = data.terraform_remote_state.aws_platform.outputs.ecr_repository_arn
}
