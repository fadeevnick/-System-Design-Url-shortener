output "instance_id" {
  value = aws_instance.load_test_host.id
}

output "public_ip" {
  value = aws_instance.load_test_host.public_ip
}

output "private_ip" {
  value = aws_instance.load_test_host.private_ip
}
