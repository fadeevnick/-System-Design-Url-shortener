# Terraform Backend Bootstrap

This stack creates the shared Terraform backend:

```text
S3 bucket -> stores platform.tfstate, application.tfstate and lockfiles
```

The state for this bootstrap stack is local by design because the remote
backend does not exist before this stack runs. In a production AWS account,
this bootstrap is normally owned by a management account, CloudFormation, or
a dedicated infrastructure pipeline and is protected from application
deletion.

The S3 bucket is configured with:

```text
versioning
server-side encryption
public access block
TLS-only bucket policy
prevent_destroy
```

## Create the backend

First ensure the AWS CLI is authenticated to the intended account:

```bash
aws sts get-caller-identity
```

Then:

```bash
cd infra/terraform/bootstrap/aws
cp terraform.tfvars.example terraform.tfvars
# choose a globally unique state_bucket_name
terraform init
terraform validate
terraform plan
terraform apply
```

Do not run `terraform destroy` against this stack as part of an application
cleanup. The state bucket has `prevent_destroy = true`.

## Configure the other stacks

Use the resulting bucket name in both backend configuration files:

```hcl
bucket         = "the-created-state-bucket"
key            = "url-shortener/platform.tfstate"
region         = "eu-central-1"
use_lockfile   = true
```

The Application stack uses the same bucket and lock table but a different key:

```hcl
key = "url-shortener/application.tfstate"
```
