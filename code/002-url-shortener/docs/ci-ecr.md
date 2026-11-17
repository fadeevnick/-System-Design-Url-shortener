# CI: Build and Publish to ECR

Workflow: `.github/workflows/publish-ecr.yml`

## Trigger

The workflow runs only for Git tags matching:

```text
v*
```

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag is used as the immutable ECR image tag:

```text
<account>.dkr.ecr.eu-central-1.amazonaws.com/url-shortener:v0.1.0
```

The ECR repository is configured with immutable tags, so a tag must not be
reused for another image.

## Required GitHub configuration

Add this repository secret:

```text
AWS_ROLE_TO_ASSUME
```

It must contain the ARN of an AWS IAM role trusted by GitHub Actions OIDC.
The role should be restricted to this repository and allow only the ECR push
actions required by the workflow.

The workflow does not use long-lived AWS access keys and does not deploy to
EC2 or run Ansible.

## Image source

The current pipeline builds the NestJS implementation:

```text
context: implementations/nestjs
Dockerfile: implementations/nestjs/Dockerfile
platform: linux/amd64
```

After a successful run, copy the `IMAGE_URI` from the workflow summary into
the selected Ansible `inventory.ini` manually.

## Current limitation

`npm run lint` is not part of this workflow yet because the project does not
currently contain an ESLint 9 flat config. It should be added after introducing
`eslint.config.js` and then enabled as a separate CI step.
