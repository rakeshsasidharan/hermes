#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const storageStack = new HermesStorageStack(app, 'HermesStorageStack', { env });

const webSocketStack = new HermesWebSocketStack(app, 'HermesWebSocketStack', {
  env,
  wsConnectionsTable: storageStack.wsConnectionsTable,
});

new HermesEmailStack(app, 'HermesEmailStack', {
  env,
  emailBucketArn: storageStack.emailBucket.bucketArn,
});
