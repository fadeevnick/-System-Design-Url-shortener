output "instance_id" {
  value = aws_instance.compose_host.id
}

output "ansible_host" {
  value = var.associate_public_ip_address ? aws_instance.compose_host.public_ip : aws_instance.compose_host.private_ip
}

output "ansible_user" {
  value = "ubuntu"
}

output "ecr_repository_url" {
  value = data.terraform_remote_state.aws_platform.outputs.ecr_repository_url
}
