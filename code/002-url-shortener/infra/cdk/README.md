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
| `appSecurityGroupId` | `sg-...` | app EC2 security group that can reach RDS |

Optional:

| Context | Default | Meaning |
| --- | --- | --- |
| `loadTestSecurityGroupId` | VPC CIDR allowed | restrict ALB inbound to load-test EC2 SG |
| `instanceType` | `t3.small` | app EC2 type |
| `desiredCapacity` | `2` | number of app instances |
| `minCapacity` | `2` | ASG min |
| `maxCapacity` | `2` | ASG max |
| `pgPoolMax` | `20` | value written to `.env` |
| `databaseUrl` | keep AMI value | value written to `.env` |
| `keyName` | none | EC2 key pair name |
| `instanceProfileName` | none | existing IAM instance profile |
| `availabilityZones` | `eu-central-1a,eu-central-1b` | AZs matching the selected subnets |
| `albAllowedCidr` | `10.0.0.0/8` | CIDR allowed to call ALB when `loadTestSecurityGroupId` is omitted |

For lab speed, `databaseUrl` can be passed as context. For a real production setup, move it to Secrets Manager or SSM Parameter Store instead of putting it into CDK context/state.

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

```bash
npx cdk deploy \
  -c vpcId=<vpc-id> \
  -c subnetIds=<subnet-1>,<subnet-2> \
  -c appAmiId=<ami-id> \
  -c appSecurityGroupId=<app-sg-id> \
  -c loadTestSecurityGroupId=<load-test-sg-id> \
  -c instanceType=<same-as-current-app> \
  -c pgPoolMax=20 \
  -c databaseUrl='<postgres-url>'
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

## Destroy

```bash
npx cdk destroy \
  -c vpcId=<vpc-id> \
  -c subnetIds=<subnet-1>,<subnet-2> \
  -c appAmiId=<ami-id> \
  -c appSecurityGroupId=<app-sg-id>
```
