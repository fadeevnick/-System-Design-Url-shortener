# Single EC2 + Compose

Use `deploy.yml` and the inventory generated from the
`infra/terraform/compose-ec2` outputs.

The playbook uses the shared `compose-host` role. This stack keeps 12
application replicas on the single host.
