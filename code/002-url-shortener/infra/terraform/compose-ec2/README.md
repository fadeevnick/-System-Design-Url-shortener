# Single EC2 + Compose

This is the fixed baseline architecture. It owns one Compose host and its
EC2-specific IAM instance profile. The shared RDS and ECR repository are read
from `aws-platform`.

The load-test host is no longer created here; use `infra/terraform/load-test-aws`
so the same generator can test every architecture.
