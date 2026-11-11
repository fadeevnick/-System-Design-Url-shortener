# Migration note

The old `infra/terraform/compose-ec2/aws` Terraform root has been retired.
Its EC2 resource and IAM ownership were imported into this root, and the old
remote state was emptied without deleting the physical resources.
