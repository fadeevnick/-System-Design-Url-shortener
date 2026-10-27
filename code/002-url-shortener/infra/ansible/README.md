# Portable Compose Deployment

Terraform provisions a VM for a specific cloud provider. Ansible configures
that VM and deploys the same Docker Compose application.

```text
Terraform cloud adapter -> ansible_host output
                              |
                              v
Ansible -> Docker -> Compose -> Nginx + scaled URL shortener replicas
```

## Install Ansible dependencies

```bash
ansible-galaxy collection install -r requirements.yml
```

## Build and publish an image

The `IMAGE_URI` can point to ECR, GHCR, Docker Hub or another registry.

For the AWS Terraform adapter, get the repository URL after `terraform apply`:

```bash
terraform output -raw ecr_repository_url
```

```bash
docker build -t "$IMAGE_URI" .
docker push "$IMAGE_URI"
```

## AWS application deployment flow

1. Apply `infra/terraform/compose-ec2/aws/platform` and obtain its stable outputs.
2. Apply `infra/terraform/compose-ec2/aws/application` and obtain `ansible_host`.
3. Put the Terraform `ansible_host` into `inventory/compose-ec2.ini`.
4. Copy `group_vars/compose_host.yml.example` to `group_vars/compose_host.yml`.
5. Set the image URI and either the AWS secret ARN or a vault-protected
   `database_url` in that file, or provide them as environment variables.
6. Run:

```bash
ansible-playbook -i inventory/compose-ec2.ini deploy-compose.yml
```

For AWS ECR, the VM must have an instance profile that permits ECR image pull
and the AWS CLI must be available on the host. For GHCR/Docker Hub, set
`REGISTRY_TYPE=generic` and provide credentials through a secret mechanism or
Ansible Vault. For a non-AWS database, use the application's existing
`DATABASE_URL` fallback and protect it with Ansible Vault or the target
cloud's secret manager.

## Other clouds

Create another Terraform adapter that produces the same outputs:

```text
ansible_host
ansible_user
```

The Ansible playbook and Docker image do not need to change. Only the VM
provider, network rules and registry authentication change.
