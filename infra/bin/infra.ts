#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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
  env: { account: env.account, region: 'us-east-1' },
  deployRegion: env.region ?? 'us-west-2',
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
  websocketCallbackEndpoint: webSocketStack.webSocketCallbackEndpoint,
  websocketApiArn: webSocketStack.webSocketApiArn,
  sesRuleSetName: config.sesRuleSetName,
});

// ACM certificate must be in us-east-1 for CloudFront.
// HermesCertStack manages the cert resource; we import it by ARN here to avoid
// CDK's cross-region reference mechanism (ExportsWriter/ExportsReader), which
// creates a fragile SSM-version-pinned dependency that breaks on stack updates.
const certStack = new HermesCertStack(app, 'HermesCertStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domainName: config.domainName,
  hostedZoneDomainName: config.hostedZoneDomainName,
});

// Import the cert by ARN (stored in cdk.context.json as certArn).
// This avoids CDK cross-region token resolution and the ExportsReader in HermesAppStack.
const certArn = app.node.getContext('certArn') as string;
const certificate = acm.Certificate.fromCertificateArn(certStack, 'ImportedCert', certArn);

const imageDigest = app.node.tryGetContext('imageDigest') as string | undefined;

new HermesAppStack(app, 'HermesAppStack', {
  env,
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
  certificate,
  hostedZoneDomainName: config.hostedZoneDomainName,
  ...(imageDigest ? { appRepo: ecrStack.appRepo, imageDigest } : {}),
});
