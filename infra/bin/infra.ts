#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HermesAuthStack } from '../lib/hermes-auth-stack';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';
import { HermesAppStack } from '../lib/hermes-app-stack';
import { HermesCertStack } from '../lib/hermes-cert-stack';
import { HermesEcrStack } from '../lib/hermes-ecr-stack';
import { HermesGithubRoleStack } from '../lib/hermes-github-role-stack';
import { getConfig } from '../lib/config';

const app = new cdk.App();
const config = getConfig(app);

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const ecrStack = new HermesEcrStack(app, 'HermesEcrStack', { env });

new HermesGithubRoleStack(app, 'HermesGithubRoleStack', {
  env,
  ecrRepositoryName: ecrStack.appRepo.repositoryName,
  ssmDigestParam: '/hermes/app-image-digest',
});

const authStack = new HermesAuthStack(app, 'HermesAuthStack', { env });

const storageStack = new HermesStorageStack(app, 'HermesStorageStack', {
  env,
  emailBucketName: config.emailBucketName,
  addressesTableName: config.addressesTableName,
  messagesTableName: config.messagesTableName,
  draftsTableName: config.draftsTableName,
  wsConnectionsTableName: config.wsConnectionsTableName,
});

const webSocketStack = new HermesWebSocketStack(app, 'HermesWebSocketStack', {
  env,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  userPoolId: authStack.userPool.ref,
});

const emailStack = new HermesEmailStack(app, 'HermesEmailStack', {
  env,
  emailBucket: storageStack.emailBucket,
  messagesTable: storageStack.messagesTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  websocketApiEndpoint: webSocketStack.webSocketEndpoint,
  websocketApiArn: webSocketStack.webSocketApiArn,
  sesRuleSetName: config.sesRuleSetName,
});

// ACM certificate must be in us-east-1 for CloudFront.
const certStack = new HermesCertStack(app, 'HermesCertStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domainName: config.domainName,
  hostedZoneDomainName: config.hostedZoneDomainName,
  crossRegionReferences: true,
});

const imageDigest = app.node.tryGetContext('imageDigest') as string | undefined;

new HermesAppStack(app, 'HermesAppStack', {
  env,
  crossRegionReferences: true,
  emailBucket: storageStack.emailBucket,
  addressesTable: storageStack.addressesTable,
  messagesTable: storageStack.messagesTable,
  draftsTable: storageStack.draftsTable,
  wsConnectionsTable: storageStack.wsConnectionsTable,
  sesRuleSetName: config.sesRuleSetName,
  websocketEndpoint: webSocketStack.webSocketEndpoint,
  inboundProcessorArn: emailStack.inboundEmailProcessor.functionArn,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  domainName: config.domainName,
  certificate: certStack.certificate,
  hostedZoneDomainName: config.hostedZoneDomainName,
  ...(imageDigest ? { appRepo: ecrStack.appRepo, imageDigest } : {}),
});
