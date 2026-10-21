# URL Shortener AWS CDK

CDK stack for the horizontal app scaling experiment:

```text
load-test EC2 -> internal ALB -> Auto Scaling Group app instances -> existing RDS PostgreSQL
```

The stack intentionally does not create RDS. The database is changed independently during bottleneck experiments.

## What It Creates

- internal Application Load Balancer;
- HTTP listener on port `80`;
- target group with `/health` checks on app port `3000`;
- Auto Scaling Group with `desiredCapacity=2`;
- launch template based on an existing app AMI;
- ALB security group;
- ingress from ALB security group to the existing app security group.

## One-Time Setup

```bash
cd /home/nickf/Documents/architecture/code/002-url-shortener/infra/cdk
npm install
npx cdk bootstrap aws://<account-id>/eu-central-1
```

## Required Inputs

The stack imports existing infrastructure through CDK context:

| Context | Example | Meaning |
| --- | --- | --- |
| `vpcId` | `vpc-...` | VPC where app/load-test/RDS live |
| `subnetIds` | `subnet-a,subnet-b` | at least two subnets for the internal ALB and ASG |
| `appAmiId` | `ami-...` | AMI created from the current app EC2 |
| `appSecurityGroupIds` | `sg-app,sg-rds` | all security groups that must be attached to each new app EC2 |
| `databaseSecretArn` | `arn:aws:secretsmanager:...` | ARN of the Secrets Manager secret containing the RDS credentials |

Optional:

| Context | Default | Meaning |
| --- | --- | --- |
| `loadTestSecurityGroupId` | VPC CIDR allowed | restrict ALB inbound to load-test EC2 SG |
| `instanceType` | `t3.small` | app EC2 type |
| `desiredCapacity` | `2` | number of app instances |
| `minCapacity` | `2` | ASG min |
| `maxCapacity` | `2` | ASG max |
| `pgPoolMax` | `20` | value written to `.env` |
| `keyName` | none | EC2 key pair name |
| `availabilityZones` | `eu-central-1a,eu-central-1b` | AZs matching the selected subnets |
| `albAllowedCidr` | `10.0.0.0/8` | CIDR allowed to call ALB when `loadTestSecurityGroupId` is omitted |

The stack creates a dedicated EC2 IAM role and instance profile. That role can read only the configured Secrets Manager secret. The app receives only `DATABASE_SECRET_ARN`; the password is fetched by the AWS SDK when NestJS starts.

Create the secret separately in AWS Secrets Manager. Its `SecretString` should be JSON, for example:

```json
{
  "host": "url-shortener-db-large.xxxxx.eu-central-1.rds.amazonaws.com",
  "port": 5432,
  "username": "url_shortener",
  "password": "stored-in-secrets-manager",
  "dbname": "url_shortener"
}
```

The secret ARN is safe to pass as CDK context; the password is not. Do not put the password into `cdk.context.json`, a Makefile, User Data, CloudFormation parameters, or GitHub workflow arguments.

## Create App AMI

Find the current app EC2 instance id:

```bash
aws ec2 describe-instances \
  --region eu-central-1 \
  --filters "Name=private-ip-address,Values=<app-private-ip>" \
  --query "Reservations[].Instances[].{InstanceId:InstanceId,PrivateIp:PrivateIpAddress,Name:Tags[?Key=='Name']|[0].Value}" \
  --output table
```

Create an AMI from it:

```bash
aws ec2 create-image \
  --region eu-central-1 \
  --instance-id <app-instance-id> \
  --name url-shortener-app-$(date +%Y%m%d-%H%M) \
  --no-reboot
```

Wait until the AMI is available:

```bash
aws ec2 describe-images \
  --region eu-central-1 \
  --image-ids <ami-id> \
  --query "Images[].State" \
  --output text
```

## Deploy

To avoid repeating the long context command, use the Makefile. Run it from this directory:

```bash
make diff \
  VPC_ID=<vpc-id> \
  SUBNET_IDS=<subnet-1>,<subnet-2> \
  APP_AMI_ID=<ami-id> \
  APP_SECURITY_GROUP_IDS=<app-sg-id>,<rds-large-sg-id> \
  DATABASE_SECRET_ARN=<database-secret-arn> \
  LOAD_TEST_SECURITY_GROUP_ID=<load-test-sg-id> \
  INSTANCE_TYPE=<same-as-current-app> \
  PG_POOL_MAX=20
```

After reviewing the changes, deploy with the same values:

```bash
make deploy \
  VPC_ID=<vpc-id> \
  SUBNET_IDS=<subnet-1>,<subnet-2> \
  APP_AMI_ID=<ami-id> \
  APP_SECURITY_GROUP_IDS=<app-sg-id>,<rds-large-sg-id> \
  DATABASE_SECRET_ARN=<database-secret-arn> \
  LOAD_TEST_SECURITY_GROUP_ID=<load-test-sg-id> \
  INSTANCE_TYPE=<same-as-current-app> \
  PG_POOL_MAX=20
```

The Makefile uses `appSecurityGroupIds`, not `appSecurityGroupId`, because each new app instance must receive both the application security group and the security group allowing access to the current RDS instance.

The same context can be used for cleanup:

```bash
make destroy \
  VPC_ID=<vpc-id> \
  SUBNET_IDS=<subnet-1>,<subnet-2> \
  APP_AMI_ID=<ami-id> \
  APP_SECURITY_GROUP_IDS=<app-sg-id>,<rds-large-sg-id> \
  DATABASE_SECRET_ARN=<database-secret-arn> \
  LOAD_TEST_SECURITY_GROUP_ID=<load-test-sg-id> \
  PG_POOL_MAX=20
```

CDK output `AlbDnsName` becomes the k6 `BASE_URL`:

```bash
export BASE_URL=http://<AlbDnsName>
```

## Check Targets

```bash
aws elbv2 describe-target-health \
  --region eu-central-1 \
  --target-group-arn <target-group-arn> \
  --output table
```

Both targets should be `healthy`.

## Run The Experiment

```bash
BASE_URL=$BASE_URL \
WORKLOAD=hot-read \
RATE=2000 \
DURATION=3m \
TARGET_P95_MS=300 \
MAX_ERROR_RATE=0.01 \
MAX_DROPPED_ITERATIONS=100 \
PRE_ALLOCATED_VUS=2500 \
MAX_VUS=7000 \
k6 run --summary-export results-hot-read-2000-2app-rds-m7g-pool20.json tools/k6/url-shortener.js
```

Collect `/metrics` from each app private IP directly, not through ALB:

```bash
curl http://<app-1-private-ip>:3000/metrics > metrics-hot-read-2000-2app-app1-pool20.txt
curl http://<app-2-private-ip>:3000/metrics > metrics-hot-read-2000-2app-app2-pool20.txt
```

