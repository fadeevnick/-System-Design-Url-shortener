#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { UrlShortenerEcrStack } from '../lib/url-shortener-ecr-stack';

const app = new cdk.App();

new UrlShortenerEcrStack(app, 'UrlShortenerEcrStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
  },
});
