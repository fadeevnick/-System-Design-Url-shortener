CDK ?= npx cdk

VPC_ID ?= vpc-07134e7a97e7796cf
SUBNET_IDS ?= subnet-0bbdaab1636648a64,subnet-082b44fc2ea443019
APP_AMI_ID ?= ami-0506d343fca1001f3
APP_SECURITY_GROUP_IDS ?= sg-05c5edc7069a2d54b,sg-0d006fddd15aa4193
LOAD_TEST_SECURITY_GROUP_ID ?= sg-0a117527190862864
AVAILABILITY_ZONES ?= eu-central-1a,eu-central-1b
INSTANCE_TYPE ?= t3.small
PG_POOL_MAX ?= 20
DATABASE_SECRET_ARN ?= arn:aws:secretsmanager:eu-central-1:075483720790:secret:url-shortener/rds/m7g-2xlarge-mILDib

CDK_CONTEXT = \
	-c vpcId=$(VPC_ID) \
	-c subnetIds=$(SUBNET_IDS) \
	-c appAmiId=$(APP_AMI_ID) \
	-c appSecurityGroupIds=$(APP_SECURITY_GROUP_IDS) \
	-c loadTestSecurityGroupId=$(LOAD_TEST_SECURITY_GROUP_ID) \
	-c availabilityZones=$(AVAILABILITY_ZONES) \
	-c instanceType=$(INSTANCE_TYPE) \
	-c pgPoolMax=$(PG_POOL_MAX) \
	-c databaseSecretArn=$(DATABASE_SECRET_ARN)

.PHONY: check-context diff synth deploy destroy

check-context:
	@test -n "$(VPC_ID)" || (echo "VPC_ID is required"; exit 1)
	@test -n "$(SUBNET_IDS)" || (echo "SUBNET_IDS is required"; exit 1)
	@test -n "$(APP_AMI_ID)" || (echo "APP_AMI_ID is required"; exit 1)
	@test -n "$(APP_SECURITY_GROUP_IDS)" || (echo "APP_SECURITY_GROUP_IDS is required"; exit 1)
	@test -n "$(LOAD_TEST_SECURITY_GROUP_ID)" || (echo "LOAD_TEST_SECURITY_GROUP_ID is required"; exit 1)
	@test -n "$(DATABASE_SECRET_ARN)" || (echo "DATABASE_SECRET_ARN is required"; exit 1)

diff: check-context
	$(CDK) diff $(CDK_CONTEXT)

synth: check-context
	$(CDK) synth $(CDK_CONTEXT)

deploy: check-context
	$(CDK) deploy $(CDK_CONTEXT)

destroy: check-context
	$(CDK) destroy $(CDK_CONTEXT)
