output "alb_dns_name" {
  value = aws_lb.url_shortener.dns_name
}

output "compose_instance_ids" {
  value = aws_instance.compose_host[*].id
}

output "compose_public_ips" {
  value = aws_instance.compose_host[*].public_ip
}

output "compose_private_ips" {
  value = aws_instance.compose_host[*].private_ip
}

output "ansible_inventory" {
  value = join("\n", [
    for index, instance in aws_instance.compose_host : "compose-${index + 1} ansible_host=${var.associate_public_ip_address ? instance.public_ip : instance.private_ip} ansible_user=ubuntu"
  ])
}
