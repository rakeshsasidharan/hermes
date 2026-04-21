#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HermesAuthStack } from '../lib/hermes-auth-stack';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';
import { HermesAppStack } from '../lib/hermes-app-stack';
import { HermesCertStack } from '../lib/hermes-cert-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const DOMAIN_NAME = 'hermes.rpillai.dev';
const HOSTED_ZONE_DOMAIN = 'rpillai.dev';

const authStack = new HermesAuthStack(app, 'HermesAuthStack', { env });

const storageStack = new HermesStorageStack(app, 'HermesStorageStack', { env });

const webSocketStack = new HermesWebSocketStack(app, 'HermesWebSocketStack', {
  env,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  userPoolId: authStack.userPool.ref,
});

new HermesEmailStack(app, 'HermesEmailStack', {
  env,
  emailBucket: storageStack.emailBucket,
  messagesTable: storageStack.messagesTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  websocketApiEndpoint: webSocketStack.webSocketEndpoint,
  websocketApiArn: webSocketStack.webSocketApiArn,
});

// ACM certificate must be in us-east-1 for CloudFront.
const certStack = new HermesCertStack(app, 'HermesCertStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domainName: DOMAIN_NAME,
  hostedZoneDomainName: HOSTED_ZONE_DOMAIN,
  crossRegionReferences: true,
});

new HermesAppStack(app, 'HermesAppStack', {
  env,
  crossRegionReferences: true,
  emailBucket: storageStack.emailBucket,
  addressesTable: storageStack.addressesTable,
  messagesTable: storageStack.messagesTable,
  draftsTable: storageStack.draftsTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  sesRuleSetName: 'hermes-receipt-rules',
  websocketEndpoint: webSocketStack.webSocketEndpoint,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  domainName: DOMAIN_NAME,
  certificate: certStack.certificate,
  hostedZoneDomainName: HOSTED_ZONE_DOMAIN,
});
