#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlShortenerEcsFargateStack } from '../lib/url-shortener-ecs-fargate-stack';

const app = new cdk.App();

new UrlShortenerEcsFargateStack(app, 'UrlShortenerEcsFargateStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
  },
});
