output "ecr_repository_name" {
  value = aws_ecr_repository.url_shortener.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.url_shortener.repository_url
}

output "ecr_repository_arn" {
  value = aws_ecr_repository.url_shortener.arn
}

output "database_identifier" {
  value = aws_db_instance.url_shortener.identifier
}

output "database_address" {
  value = aws_db_instance.url_shortener.address
}

output "database_port" {
  value = aws_db_instance.url_shortener.port
}
