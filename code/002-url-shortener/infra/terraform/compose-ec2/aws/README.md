# Compose Host: AWS Terraform Adapter

This directory contains production-style Platform and Application lifecycles.
Use separate remote state for each stack.

The Platform stack owns long-lived VPC, security groups, ECR, IAM, RDS and
Secrets Manager resources. The Application stack owns replaceable EC2/ASG,
ALB or ECS resources. They use separate remote state.

The deployment contract is provider-neutral:

```text
Terraform creates VM
Terraform outputs ansible_host and ansible_user
Ansible installs Docker and deploys Compose
```

## Usage

Initialize Platform state first:

```bash
cd infra/terraform/compose-ec2/aws/platform
cp backend.hcl.example backend.hcl
# fill in the existing S3 state bucket and DynamoDB lock table
terraform init -backend-config=backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform plan
terraform apply
terraform output -raw ecr_repository_url
```

Then initialize Application state:

```bash
cd ../application
cp backend.hcl.example backend.hcl
# use the same state bucket and lock table with the application key
terraform init -backend-config=backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform plan
terraform apply
terraform output -raw ansible_host
```

The same Ansible playbook can target a VM created by another Terraform adapter.

Do not point a new Terraform resource at an existing VPC, RDS or ECR without
first deciding which tool owns it. Existing resources must be imported or
referenced; creating duplicates is not a production migration strategy.
