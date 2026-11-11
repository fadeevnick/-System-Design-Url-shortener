# Ansible deployment layout

Terraform provisions the infrastructure for a concrete architecture. Ansible
configures the hosts and deploys the application runtime.

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

## Architecture entrypoints

```text
infra/ansible/compose-ec2/deploy.yml
infra/ansible/compose-ec2-alb/deploy.yml
```

Both entrypoints use the shared `compose-host` role. Each architecture keeps
its own inventory and Compose/Nginx files, while Docker, registry-login and
deployment tasks are implemented once in `infra/ansible/roles/compose-host/`.

## Legacy AWS application deployment flow

1. Apply `infra/terraform/aws-platform` and obtain its stable outputs.
2. Apply the selected application stack, such as `infra/terraform/compose-ec2`.
3. Put the Terraform host output into the architecture inventory.
4. Copy the relevant stack inventory example to `inventory.ini` and fill in its variables.
5. Set the image URI and either the AWS secret ARN or a vault-protected
   `database_url` in that file, or provide them as environment variables.
6. Run the architecture entrypoint:

```bash
ANSIBLE_CONFIG=infra/ansible/ansible.cfg \
ansible-playbook -i infra/ansible/compose-ec2/inventory.ini infra/ansible/compose-ec2/deploy.yml
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
