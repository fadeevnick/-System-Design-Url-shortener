# Platform Stack

This stack owns long-lived resources for the Compose deployment:

```text
ECR repository
EC2 runtime IAM role
EC2 instance profile
```

The target production Platform stack also owns VPC, subnets, security groups,
RDS and Secrets Manager. Existing resources must be imported before Terraform
manages them; this stack must not create duplicate databases or networks.

Use an S3 backend with native S3 locking:

```bash
cp backend.hcl.example backend.hcl
# fill in the existing state bucket
terraform init -backend-config=backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform plan
terraform apply
```

Outputs consumed by the Application stack include:

```text
ecr_repository_url
ecr_repository_arn
instance_profile_name
```
