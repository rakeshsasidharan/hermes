#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HermesStorageStack } from '../lib/hermes-storage-stack';

const app = new cdk.App();

new HermesStorageStack(app, 'HermesStorageStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
