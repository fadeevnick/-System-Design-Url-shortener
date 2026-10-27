# Terraform Stack Lifecycle

The production boundary for this deployment is split by resource lifetime.
The stacks should use separate remote state and separate deployment
permissions.

## Platform stack

Long-lived shared resources:

```text
VPC and subnets
security groups
ECR repositories
IAM roles and instance profiles
RDS PostgreSQL
Secrets Manager secrets
```

The Platform stack changes infrequently. Application deployments must not
recreate or replace these resources.

Existing resources must be imported into the Platform state before Terraform
manages them. They must not be recreated beside the existing VPC or RDS.

## Application stack

Replaceable application-serving resources:

```text
EC2 instance or Auto Scaling Group
ALB and target group
ECS cluster, service and task definition
CloudWatch application logs
```

For the current Compose variant, the application stack contains one EC2 host
and the host runs Nginx plus scaled Compose containers. For the ECS variant,
the application stack contains an ECS service behind an ALB.

## Image delivery is a separate lifecycle

Terraform creates the ECR repository once. CI/CD publishes immutable images:

```text
git push
  -> build and test
  -> docker build
  -> docker push IMAGE_TAG=GIT_SHA
  -> update Compose or ECS application stack
```

Terraform should not run for every source-code change. An image tag or ECS task
definition changes; the Platform stack remains unchanged.

## State boundaries

```text
platform.tfstate
  VPC, security groups, ECR, IAM, RDS, secrets

application.tfstate
  EC2/ASG, ALB or ECS service
```

The Application stack consumes stable Platform outputs such as subnet IDs,
security group IDs, ECR repository URL and instance profile name through a
remote-state contract or a controlled configuration pipeline.

## Migration order

1. Identify the current owner of every AWS resource.
2. Create the Platform remote state backend.
3. Import existing VPC, subnets, security groups, RDS and secrets only when
   Terraform is intentionally made their owner.
4. Create or import ECR and IAM resources in Platform state.
5. Create the new Application stack using Platform outputs.
6. Deploy the image with Ansible or ECS.
7. Destroy only the old application-serving resources after validation.

For the current phase, step 3 is deliberately postponed. Existing VPC,
subnets, security groups, RDS and secrets remain managed outside these new
Terraform stacks and are passed as inputs where required.

This prevents Terraform from trying to recreate a production database or
network while introducing the new application deployment path.
