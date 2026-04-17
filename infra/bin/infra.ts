#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';
import { HermesAppStack } from '../lib/hermes-app-stack';

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
  emailBucket: storageStack.emailBucket,
  messagesTable: storageStack.messagesTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  websocketApiEndpoint: webSocketStack.webSocketEndpoint,
  websocketApiArn: webSocketStack.webSocketApiArn,
});

new HermesAppStack(app, 'HermesAppStack', {
  env,
  emailBucket: storageStack.emailBucket,
  addressesTable: storageStack.addressesTable,
  messagesTable: storageStack.messagesTable,
  draftsTable: storageStack.draftsTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  sesRuleSetName: 'hermes-receipt-rules',
  websocketEndpoint: webSocketStack.webSocketEndpoint,
});
