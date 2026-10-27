output "instance_name" {
  description = "Created Compute Engine instance name."
  value       = google_compute_instance.compose_host.name
}

output "instance_id" {
  description = "Created Compute Engine instance id."
  value       = google_compute_instance.compose_host.id
}

output "private_ip" {
  description = "Private IP used for internal access."
  value       = google_compute_instance.compose_host.network_interface[0].network_ip
}

output "ansible_host" {
  description = "Address to put into the shared Ansible inventory."
  value = var.assign_public_ip ? try(
    google_compute_instance.compose_host.network_interface[0].access_config[0].nat_ip,
    google_compute_instance.compose_host.network_interface[0].network_ip,
  ) : google_compute_instance.compose_host.network_interface[0].network_ip
}

output "ansible_user" {
  description = "Default Ubuntu SSH user for the shared Ansible playbook."
  value       = "ubuntu"
}

output "compose_runtime" {
  description = "Runtime configured by Ansible after Terraform."
  value       = "docker-compose"
}
