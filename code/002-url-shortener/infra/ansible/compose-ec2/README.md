# Single EC2 + Compose

Use `deploy.yml` and the inventory generated from the
`infra/terraform/compose-ec2` outputs.

The playbook currently imports the legacy root playbook to avoid duplicating
the Docker/Compose tasks. Those common tasks should be extracted into roles
after the Terraform ownership migration is complete.
