# Terraform layout

Terraform roots are concrete deployment stacks. A provider is part of the
stack name when it matters, rather than an extra provider directory inside
every architecture.

```text
bootstrap/aws/       Terraform backend bootstrap
aws-platform/        shared AWS resources
load-test-aws/       reusable AWS load generator
github-actions-ecr/  GitHub OIDC role for publishing to existing ECR
compose-ec2/         one EC2 host with Compose
compose-ec2-alb/     two EC2 hosts with Compose behind an ALB
ecs-ec2/             future ECS on EC2 experiment
ecs-fargate-aws/     future ECS Fargate experiment
kubernetes-digitalocean/ future Kubernetes on DigitalOcean experiment
```

Each root has its own Terraform state. Application stacks read the shared
`aws-platform` state but do not create another RDS, ECR repository or database
secret.
