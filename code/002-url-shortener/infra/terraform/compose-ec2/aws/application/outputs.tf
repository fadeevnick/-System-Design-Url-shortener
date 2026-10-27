output "instance_id" {
  description = "Application EC2 instance id."
  value       = aws_instance.compose_host.id
}

output "private_ip" {
  description = "Application EC2 private IP."
  value       = aws_instance.compose_host.private_ip
}

output "ansible_host" {
  description = "Address used by Ansible."
  value       = var.associate_public_ip_address ? aws_instance.compose_host.public_ip : aws_instance.compose_host.private_ip
}

output "ansible_user" {
  description = "Default Ubuntu SSH user."
  value       = "ubuntu"
}
