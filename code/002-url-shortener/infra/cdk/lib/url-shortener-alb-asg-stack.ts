import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

type RequiredContext = {
  vpcId: string;
  subnetIds: string[];
  appAmiId: string;
  appSecurityGroupIds: string[];
};

type OptionalContext = {
  loadTestSecurityGroupId?: string;
  instanceType: string;
  desiredCapacity: number;
  minCapacity: number;
  maxCapacity: number;
  port: number;
  pgPoolMax: number;
  databaseSecretArn: string;
  appDir: string;
  serviceName: string;
  keyName?: string;
  availabilityZones: string[];
  albAllowedCidr: string;
};

export class UrlShortenerAlbAsgStack extends Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const required = this.readRequiredContext();
    const optional = this.readOptionalContext();

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: required.vpcId,
      availabilityZones: optional.availabilityZones,
      privateSubnetIds: required.subnetIds,
    });

    const selectedSubnets = required.subnetIds.map((subnetId, index) =>
      ec2.Subnet.fromSubnetId(this, `Subnet${index + 1}`, subnetId),
    );

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Internal ALB security group for URL shortener load tests',
      allowAllOutbound: true,
    });

    if (optional.loadTestSecurityGroupId) {
      const loadTestSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
        this,
        'LoadTestSecurityGroup',
        optional.loadTestSecurityGroupId,
        { mutable: false },
      );

      albSecurityGroup.addIngressRule(
        loadTestSecurityGroup,
        ec2.Port.tcp(80),
        'Allow load-test EC2 to call the internal ALB',
      );
    } else {
      albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(optional.albAllowedCidr),
        ec2.Port.tcp(80),
        'Allow HTTP from the configured CIDR',
      );
    }

    const appSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'AppSecurityGroup',
      required.appSecurityGroupIds[0],
      { mutable: true },
    );

    appSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(optional.port),
      'Allow ALB to reach URL shortener app',
    );

    const databaseSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'DatabaseSecret',
      optional.databaseSecretArn,
    );
    const appRole = new iam.Role(this, 'AppRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Runtime role for URL shortener app EC2 instances',
    });
    databaseSecret.grantRead(appRole);
    const appInstanceProfile = new iam.CfnInstanceProfile(this, 'AppInstanceProfile', {
      roles: [appRole.roleName],
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: false,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnets: selectedSubnets },
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: optional.port,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
      },
    });

    alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: false,
      defaultTargetGroups: [targetGroup],
    });

    const launchTemplate = new ec2.CfnLaunchTemplate(this, 'LaunchTemplate', {
      launchTemplateName: `${Stack.of(this).stackName}-app`,
      launchTemplateData: {
        imageId: required.appAmiId,
        instanceType: optional.instanceType,
        keyName: optional.keyName,
        iamInstanceProfile: { name: appInstanceProfile.ref },
        securityGroupIds: required.appSecurityGroupIds,
        userData: cdk.Fn.base64(this.renderUserData(optional)),
        tagSpecifications: [
          {
            resourceType: 'instance',
            tags: [
              { key: 'Name', value: 'url-shortener-app-asg' },
              { key: 'Service', value: 'url-shortener' },
              { key: 'ManagedBy', value: 'cdk' },
            ],
          },
        ],
      },
    });

    const asg = new autoscaling.CfnAutoScalingGroup(this, 'AutoScalingGroup', {
      autoScalingGroupName: `${Stack.of(this).stackName}-asg`,
      minSize: String(optional.minCapacity),
      maxSize: String(optional.maxCapacity),
      desiredCapacity: String(optional.desiredCapacity),
      vpcZoneIdentifier: required.subnetIds,
      healthCheckType: 'ELB',
      healthCheckGracePeriod: 90,
      targetGroupArns: [targetGroup.targetGroupArn],
      launchTemplate: {
        launchTemplateId: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
      tags: [
        {
          key: 'Service',
          value: 'url-shortener',
          propagateAtLaunch: true,
        },
        {
          key: 'ManagedBy',
          value: 'cdk',
          propagateAtLaunch: true,
        },
      ],
    });

    asg.node.addDependency(targetGroup);

    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
    });

    new CfnOutput(this, 'TargetGroupArn', {
      value: targetGroup.targetGroupArn,
    });

    new CfnOutput(this, 'AutoScalingGroupName', {
      value: asg.autoScalingGroupName ?? `${Stack.of(this).stackName}-asg`,
    });
  }

  private readRequiredContext(): RequiredContext {
    const vpcId = this.getStringContext('vpcId');
    const subnetIds = this.getListContext('subnetIds');
    const appAmiId = this.getStringContext('appAmiId');
    const appSecurityGroupIds = this.getListContext('appSecurityGroupIds');

    if (subnetIds.length < 2) {
      throw new Error('Context subnetIds must contain at least two subnet ids for ALB.');
    }
    if (appSecurityGroupIds.length === 0) {
      throw new Error('Context appSecurityGroupIds must contain at least one security group id.');
    }

    return {
      vpcId,
      subnetIds,
      appAmiId,
      appSecurityGroupIds,
    };
  }

  private readOptionalContext(): OptionalContext {
    return {
      loadTestSecurityGroupId: this.tryGetStringContext('loadTestSecurityGroupId'),
      instanceType: this.tryGetStringContext('instanceType') ?? 't3.small',
      desiredCapacity: this.getNumberContext('desiredCapacity', 2),
      minCapacity: this.getNumberContext('minCapacity', 2),
      maxCapacity: this.getNumberContext('maxCapacity', 2),
      port: this.getNumberContext('port', 3000),
      pgPoolMax: this.getNumberContext('pgPoolMax', 20),
      databaseSecretArn: this.getStringContext('databaseSecretArn'),
      appDir: this.tryGetStringContext('appDir') ?? '/home/ubuntu/002-url-shortener',
      serviceName: this.tryGetStringContext('serviceName') ?? 'url-shortener',
      keyName: this.tryGetStringContext('keyName'),
      availabilityZones: this.getListContext('availabilityZones', [
        `${Stack.of(this).region}a`,
        `${Stack.of(this).region}b`,
      ]),
      albAllowedCidr: this.tryGetStringContext('albAllowedCidr') ?? '10.0.0.0/8',
    };
  }

  private renderUserData(context: OptionalContext): string {
    const envLines = [
      `PORT=${context.port}`,
      'BASE_URL=http://localhost:3000',
      `PG_POOL_MAX=${context.pgPoolMax}`,
      `AWS_REGION=${Stack.of(this).region}`,
      `DATABASE_SECRET_ARN=${context.databaseSecretArn}`
    ];

    return [
      '#!/bin/bash',
      'set -euo pipefail',
      `APP_DIR='${context.appDir}'`,
      `SERVICE_NAME='${context.serviceName}'`,
      'if [ -d "$APP_DIR" ]; then',
      '  cat > "$APP_DIR/.env" <<\'ENVEOF\'',
      ...envLines,
      'ENVEOF',
      '  chown ubuntu:ubuntu "$APP_DIR/.env" || true',
      'fi',
      'systemctl daemon-reload',
      'systemctl enable "$SERVICE_NAME"',
      'systemctl restart "$SERVICE_NAME"',
    ].join('\n');
  }

  private getStringContext(name: string): string {
    const value = this.node.tryGetContext(name);
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing required CDK context: ${name}`);
    }
    return value;
  }

  private tryGetStringContext(name: string): string | undefined {
    const value = this.node.tryGetContext(name);
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }
    return value;
  }

  private getListContext(name: string, defaultValue?: string[]): string[] {
    const value = this.node.tryGetContext(name);
    if ((value === undefined || value === null || value === '') && defaultValue) {
      return defaultValue;
    }
    if (Array.isArray(value)) {
      return value.map(String).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    throw new Error(`Missing required CDK context list: ${name}`);
  }

  private getNumberContext(name: string, defaultValue: number): number {
    const value = this.node.tryGetContext(name);
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`CDK context ${name} must be a number.`);
    }

    return parsed;
  }
}
