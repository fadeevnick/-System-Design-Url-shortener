# Container Deployment Variants

The same URL shortener image is used in two infrastructure variants:

```text
Variant A: one EC2 -> Docker Compose -> scaled app replicas -> Nginx
Variant B: load-test EC2 -> internal ALB -> ECS Service -> Fargate tasks -> RDS
```

Both variants use the existing RDS PostgreSQL and Secrets Manager secret.

## 1. Build The Image

From the project root:

```bash
docker build -t url-shortener:local .
```

The image contains only the compiled NestJS application and production
dependencies. It does not contain `.env`, database credentials, or PostgreSQL.

## 2. Variant A: One EC2 + Compose + Nginx

This variant is useful for comparing multiple app processes on one host.

```text
load generator -> EC2:3000 -> Nginx:80
                                  |
                         +--------+--------+
                         |                 |
                    app replica 1     app replica 2
                         |                 |
                         +------ RDS ------+
```

Prepare `/opt/url-shortener/.env` on the EC2:

```dotenv
IMAGE_URI=075483720790.dkr.ecr.eu-central-1.amazonaws.com/url-shortener:<tag>
PG_POOL_MAX=20
AWS_REGION=eu-central-1
DATABASE_SECRET_ARN=arn:aws:secretsmanager:...
```

Log in to ECR using the EC2 instance role, then start the stack:

```bash
aws ecr get-login-password --region eu-central-1 \
  | docker login --username AWS --password-stdin \
    075483720790.dkr.ecr.eu-central-1.amazonaws.com

cd /opt/url-shortener
docker compose up --scale url-shortener=2 -d
```

Nginx exposes only port `3000` on the host and resolves the Compose service
through Docker DNS. Compose replicas share the same EC2 CPU, RAM and network.

## 3. Variant B: ALB + ECS/Fargate

The ECS CDK stack creates:

```text
ECR repository
ECS cluster
Fargate task definition
ECS service
internal ALB and target group
task IAM role for Secrets Manager
CloudWatch log group
task security group
```

Create the ECR repository first:

```bash
cd infra/cdk
make ecr-deploy
```

Then build and push an image before starting tasks:

```bash
export AWS_REGION=eu-central-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/url-shortener"
export IMAGE_TAG=$(git rev-parse --short HEAD)

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t "$ECR_URI:$IMAGE_TAG" .
docker push "$ECR_URI:$IMAGE_TAG"
```

Then synthesize/deploy the ECS stack:

```bash
cd infra/cdk
make ecs-synth IMAGE_TAG="$IMAGE_TAG"
make ecs-deploy IMAGE_TAG="$IMAGE_TAG"
```

The ECS service uses `desiredCount=2` by default. ECS starts new tasks, waits
for `/health`, registers them behind the ALB, and replaces unhealthy tasks.

## 4. Application Deployment Flow

Application code changes do not require `cdk deploy`:

```text
git push
  -> CI tests
  -> docker build
  -> push immutable image tag to ECR
  -> Compose update on EC2 or new ECS task definition
  -> health check
  -> load test
```

CDK is used when infrastructure changes:

```text
ALB, ECS service, IAM, security groups, subnets, ECR, log groups
```

For ECS, the preferred rollback is to deploy the previous task-definition image
tag. For Compose, restore the previous `IMAGE_URI` and run `docker compose up -d`.

## 5. Comparison Experiment

Use the same:

```text
RDS instance
database secret
image tag
PG_POOL_MAX
workload
load-test EC2
```

Compare:

```text
p50/p95/p99
RPS
error rate
CPU and memory
database connections
pool wait and SQL duration
deployment time
rollback time
failure of one app process/task/host
```

The Compose experiment isolates process-level scaling on one host. The ECS
experiment adds managed placement, task replacement and service-level scaling.

For a cloud-portable Compose deployment, use the Terraform adapter for the
chosen VM provider and the shared Ansible playbook:

```text
Terraform provider adapter -> VM
Ansible -> Docker -> Compose + Nginx + replicas
```

See [infra/ansible/README.md](../infra/ansible/README.md).

On AWS, the production lifecycle is split into two Terraform states:

```text
infra/terraform/compose-ec2/aws/platform
  ECR, IAM and later imported VPC/RDS/security-group resources

infra/terraform/compose-ec2/aws/application
  EC2/ASG, ALB or ECS service
```

The repository currently includes adapters for AWS EC2 and GCP Compute Engine:

```text
infra/terraform/compose-ec2/aws/platform
infra/terraform/compose-ec2/aws/application
infra/terraform/compose-ec2/gcp
```

Both adapters output the same `ansible_host` and `ansible_user` values. This
keeps provider-specific VM and network configuration out of the application
deployment logic.
