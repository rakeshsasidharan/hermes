import * as cdk from 'aws-cdk-lib/core';
import { HermesStorageStack } from '../lib/hermes-storage-stack';
import { HermesEmailStack } from '../lib/hermes-email-stack';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';
import { HermesAppStack } from '../lib/hermes-app-stack';

/**
 * Full app synthesis integration test.
 *
 * Instantiates all four stacks together the same way bin/infra.ts does.
 * This catches cross-stack circular dependencies that per-stack unit tests
 * cannot detect, because those tests mock the cross-stack resource handles.
 */
describe('Full CDK app synthesis (integration)', () => {
  test('all stacks synthesise together without errors', () => {
    expect(() => {
      const app = new cdk.App();

      const env = { account: '123456789012', region: 'us-east-1' };

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

      app.synth();
    }).not.toThrow();
  });
});
