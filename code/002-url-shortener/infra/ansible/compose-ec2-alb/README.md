# Compose on two EC2 hosts behind an ALB

This playbook is the deployment side of the `infra/terraform/compose-ec2-alb`
architecture. It deploys six application containers per host, preserving the
same total of 12 containers as the current single-host baseline.

The architecture has its own Compose and Nginx files so `BASE_URL` can point
at the ALB without changing the current single-host baseline.

## Deploy

```bash
cp inventory.example.ini inventory.ini
# replace both host addresses and the image/secret values
ANSIBLE_CONFIG=../ansible.cfg ansible-playbook -i inventory.ini deploy.yml
```

The playbook uses `serial: 1` so only one host is updated at a time. That makes
the operational difference from the current single-host deployment visible,
but it also means the first host must remain healthy while the second is being
updated.

The ALB is managed by Terraform. After applying Terraform, use its
`ansible_inventory` output to fill the two inventory entries and use
`alb_dns_name` as `BASE_URL` for k6.
