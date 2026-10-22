import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class UrlShortenerEcsFargateStack extends Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpcId = this.requiredString('vpcId');
    const subnetIds = this.requiredList('subnetIds');
    const databaseSecretArn = this.requiredString('databaseSecretArn');
    const databaseSecurityGroupId = this.requiredString('databaseSecurityGroupId');
    const loadTestSecurityGroupId = this.optionalString('loadTestSecurityGroupId');
    const imageTag = this.optionalString('imageTag') ?? 'latest';
    const pgPoolMax = this.numberContext('pgPoolMax', 20);
    const desiredCount = this.numberContext('desiredCount', 2);

    if (subnetIds.length < 2) {
      throw new Error('Context subnetIds must contain at least two subnet ids.');
    }

    const availabilityZones = this.listContext('availabilityZones', [
      `${this.region}a`,
      `${this.region}b`,
    ]);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId,
      availabilityZones,
      privateSubnetIds: subnetIds,
    });
    const subnets = subnetIds.map((subnetId, index) =>
      ec2.Subnet.fromSubnetId(this, `Subnet${index + 1}`, subnetId),
    );

    const repository = ecr.Repository.fromRepositoryName(this, 'Repository', 'url-shortener');

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Internal ALB security group for URL shortener ECS',
      allowAllOutbound: true,
    });
    if (loadTestSecurityGroupId) {
      albSecurityGroup.addIngressRule(
        ec2.SecurityGroup.fromSecurityGroupId(this, 'LoadTestSecurityGroup', loadTestSecurityGroupId, {
          mutable: false,
        }),
        ec2.Port.tcp(80),
        'Allow load-test EC2 to call the internal ALB',
      );
    }

    const taskSecurityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc,
      description: 'URL shortener ECS task security group',
      allowAllOutbound: true,
    });
    taskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow ALB to reach URL shortener tasks',
    );

    const databaseSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'DatabaseSecurityGroup',
      databaseSecurityGroupId,
      { mutable: true },
    );
    databaseSecurityGroup.addIngressRule(
      taskSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to reach PostgreSQL',
    );

    const secret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'DatabaseSecret',
      databaseSecretArn,
    );
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 512,
      memoryLimitMiB: 1024,
    });
    repository.grantPull(taskDefinition.obtainExecutionRole());
    secret.grantRead(taskDefinition.taskRole);

    const container = taskDefinition.addContainer('UrlShortener', {
      image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'url-shortener', logGroup }),
      environment: {
        PORT: '3000',
        AWS_REGION: this.region,
        PG_POOL_MAX: String(pgPoolMax),
        DATABASE_SECRET_ARN: databaseSecretArn,
      },
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q -O - http://127.0.0.1:3000/health || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30),
      },
    });
    container.addPortMappings({ containerPort: 3000 });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount,
      securityGroups: [taskSecurityGroup],
      vpcSubnets: { subnets },
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: false,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnets },
    });
    const listener = alb.addListener('HttpListener', {
      port: 80,
      open: false,
    });
    listener.addTargets('TargetGroup', {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service.loadBalancerTarget({ containerName: container.containerName, containerPort: 3000 })],
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(15),
      },
    });

    new CfnOutput(this, 'RepositoryUri', { value: repository.repositoryUri });
    new CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'ServiceName', { value: service.serviceName });
  }

  private requiredString(name: string): string {
    const value = this.optionalString(name);
    if (!value) throw new Error(`Missing required CDK context: ${name}`);
    return value;
  }

  private optionalString(name: string): string | undefined {
    const value = this.node.tryGetContext(name);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private requiredList(name: string): string[] {
    const value = this.listContext(name);
    if (value.length === 0) throw new Error(`Missing required CDK context list: ${name}`);
    return value;
  }

  private listContext(name: string, fallback: string[] = []): string[] {
    const value = this.node.tryGetContext(name);
    if (value === undefined || value === null || value === '') return fallback;
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    throw new Error(`CDK context ${name} must be a comma-separated list.`);
  }

  private numberContext(name: string, fallback: number): number {
    const value = this.node.tryGetContext(name);
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`CDK context ${name} must be a number.`);
    return parsed;
  }
}
