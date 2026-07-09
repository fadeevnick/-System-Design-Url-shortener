output "db_instance_name" {
  value = google_sql_database_instance.url_shortener.name
}

output "db_public_ip" {
  value = google_sql_database_instance.url_shortener.public_ip_address
}

output "db_name" {
  value = google_sql_database.app.name
}

output "db_user" {
  value = google_sql_user.app.name
}

output "database_url" {
  value     = "postgres://${google_sql_user.app.name}:${urlencode(random_password.db_password.result)}@${google_sql_database_instance.url_shortener.public_ip_address}:5432/${google_sql_database.app.name}"
  sensitive = true
}
