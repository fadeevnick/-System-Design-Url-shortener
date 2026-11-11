# Shared AWS platform

This root owns resources shared by the AWS URL shortener experiments:

- ECR repository;
- RDS PostgreSQL;
- future shared VPC, subnet and KMS resources.

It deliberately does not own EC2 instance profiles, ALBs, Compose hosts, ECS
services or load-test machines. Those belong to the corresponding stack.

The current RDS settings intentionally remain the same as the existing lab so
database capacity does not change while compute architectures are compared.
Before applying this root against the existing database, migrate or import the
existing Terraform state. Do not apply it beside the old platform state.
