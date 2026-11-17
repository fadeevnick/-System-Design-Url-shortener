# GitHub Actions ECR publishing

This stack manages only the AWS identity used by the root GitHub Actions
workflow `.github/workflows/publish-ecr.yml`.

It does not create or manage the ECR repository. The repository is owned by
`infra/terraform/aws-platform` and is read through its remote Terraform state.

## Resources

```text
GitHub Actions OIDC provider
GitHub tag-scoped IAM role
Inline policy limited to the existing url-shortener ECR repository
```

The role trusts only tags matching `v*` from:

```text
fadeevnick/-System-Design-Url-shortener
```

## Apply

Initialize with the shared backend configuration:

```bash
cd infra/terraform/github-actions-ecr
cp backend.hcl.example backend.hcl
# set the real state bucket in backend.hcl
terraform init -backend-config=backend.hcl
cp terraform.tfvars.example terraform.tfvars
# set the real platform state bucket in terraform.tfvars
terraform plan
terraform apply
```

The stack must be applied after `aws-platform` has a state containing
`ecr_repository_arn`.

Get the role ARN:

```bash
terraform output -raw github_actions_role_arn
```

Store that value in GitHub repository settings as:

```text
AWS_ROLE_TO_ASSUME
```

The EC2 `compose_host` role is separate. It trusts EC2 and allows image pull;
this role trusts GitHub OIDC and allows image push.
