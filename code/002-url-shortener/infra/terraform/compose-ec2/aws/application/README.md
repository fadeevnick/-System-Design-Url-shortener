# Application Stack

This stack owns replaceable application-serving infrastructure:

```text
EC2 Compose host
```

The Compose host runs Nginx and scaled URL shortener containers. The stack
reads the IAM instance profile from the Platform remote state and attaches it
to the EC2 instance. It does not create that profile. ECR, IAM,
VPC, security groups, RDS and secrets are not created here.

Initialize with the separate Application state key:

```bash
cp backend.hcl.example backend.hcl
# fill in the existing state bucket
terraform init -backend-config=backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform plan
terraform apply
terraform output -raw ansible_host
```

For an ALB/ECS deployment, the same lifecycle boundary remains: ALB, ECS
service and task definitions belong to Application state and consume Platform
outputs.
