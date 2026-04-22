import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { HermesAuthStack } from '../lib/hermes-auth-stack';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';
import { HermesAppStack } from '../lib/hermes-app-stack';

const STATEFUL_TYPES = [
  'AWS::DynamoDB::Table',
  'AWS::S3::Bucket',
  'AWS::Logs::LogGroup',
  'AWS::SecretsManager::Secret',
];

function buildApp() {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'us-east-1' };

  const authStack = new HermesAuthStack(app, 'HermesAuthStack', { env });

  const storageStack = new HermesStorageStack(app, 'HermesStorageStack', { env });

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
    inboundProcessorArn: emailStack.inboundEmailProcessor.functionArn,
    userPool: authStack.userPool,
    userPoolClient: authStack.userPoolClient,
  });

  app.synth();
  return app;
}

describe('Full CDK app synthesis (integration)', () => {
  test('all stacks synthesise together without errors', () => {
    expect(() => buildApp()).not.toThrow();
  });

  test('no stateful resource has DeletionPolicy Retain across any stack', () => {
    const app = buildApp();
    const stackIds = ['HermesAuthStack', 'HermesStorageStack', 'HermesWebSocketStack', 'HermesEmailStack', 'HermesAppStack'];

    for (const stackId of stackIds) {
      const stack = app.node.findChild(stackId) as cdk.Stack;
      const resources = Template.fromStack(stack).toJSON().Resources;

      for (const [logicalId, resource] of Object.entries(resources as Record<string, any>)) {
        if (STATEFUL_TYPES.includes(resource.Type)) {
          expect({ stack: stackId, id: logicalId, policy: resource.DeletionPolicy })
            .toMatchObject({ policy: 'Delete' });
        }
      }
    }
  });
});
