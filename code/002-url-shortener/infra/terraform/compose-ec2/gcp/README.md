# Compose Host: GCP Terraform Adapter

This adapter provisions only a Google Compute Engine VM. It follows the same
provider-neutral contract as the AWS adapter:

```text
Terraform creates VM
Terraform outputs ansible_host and ansible_user
Ansible installs Docker and deploys Compose
```

## Usage

```bash
cd infra/terraform/compose-ec2/gcp
cp terraform.tfvars.example terraform.tfvars
gcloud auth application-default login
terraform init
terraform plan
terraform apply
terraform output -raw ansible_host
```

Then use the same `infra/ansible/deploy-compose.yml` playbook and inventory
contract as with AWS.

The adapter does not create VPC firewall rules, Cloud SQL, Artifact Registry,
or Secret Manager resources. Keeping those concerns separate makes the
comparison between providers explicit and avoids hiding networking or secret
management decisions in a generic module.
