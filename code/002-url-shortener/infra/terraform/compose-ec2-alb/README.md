# Two EC2 hosts + ALB + Compose

This stack owns only the application-serving architecture:

- two `c7i.xlarge` Compose hosts;
- six application containers per host;
- an internet-facing ALB;
- ALB and host security groups;
- target group and listener;
- the EC2 runtime IAM instance profile.

RDS and ECR are read from the shared `aws-platform` state. The total of 12
application containers is kept equal to the current single-host baseline so
the experiment compares deployment topology rather than changing application
capacity.

The stack is intentionally explicit rather than an Auto Scaling Group. ASG is
a later experiment that adds another operational dimension.
