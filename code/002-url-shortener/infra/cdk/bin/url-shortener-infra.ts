#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlShortenerAlbAsgStack } from '../lib/url-shortener-alb-asg-stack';

const app = new cdk.App();

new UrlShortenerAlbAsgStack(app, 'UrlShortenerAlbAsgStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
  },
});
