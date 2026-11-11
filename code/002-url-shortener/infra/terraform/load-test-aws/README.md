# Shared AWS load-test host

The load generator is intentionally separate from every application
architecture. The same `c5.xlarge` host and k6 configuration can test the
single-host Compose, ALB, ECS and future Kubernetes variants.

Keep its instance type and network placement fixed when comparing the
architectures.
