import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { HermesWebSocketStack } from '../lib/hermes-websocket-stack';

describe('HermesWebSocketStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const helperStack = new cdk.Stack(app, 'HelperStack');
    const wsTable = dynamodb.Table.fromTableArn(
      helperStack,
      'MockWsTable',
      'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-ws-connections',
    );
    const stack = new HermesWebSocketStack(app, 'TestHermesWebSocketStack', {
      wsConnectionsTable: wsTable,
      userPoolId: 'us-east-1_testPool',
    });
    template = Template.fromStack(stack);
  });

  describe('WebSocket API', () => {
    test('creates WebSocket API named hermes-websocket', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        Name: 'hermes-websocket',
        ProtocolType: 'WEBSOCKET',
      });
    });

    test('creates $connect route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: '$connect',
      });
    });

    test('creates $disconnect route', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: '$disconnect',
      });
    });

    test('creates prod stage with autoDeploy', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
        StageName: 'prod',
        AutoDeploy: true,
      });
    });

    test('outputs WebSocket endpoint URL', () => {
      template.hasOutput('WebSocketEndpointOutput', {
        Export: { Name: 'HermesWebSocketEndpoint' },
      });
    });

    test('webSocketCallbackEndpoint uses https:// not wss://', () => {
      const app = new cdk.App();
      const helperStack = new cdk.Stack(app, 'HelperStack2');
      const wsTable2 = dynamodb.Table.fromTableArn(
        helperStack,
        'MockWsTable2',
        'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-ws-connections',
      );
      const stack2 = new HermesWebSocketStack(app, 'TestStack2', {
        wsConnectionsTable: wsTable2,
        userPoolId: 'us-east-1_testPool',
        env: { account: '123456789012', region: 'us-east-1' },
      });
      expect(stack2.webSocketCallbackEndpoint).toMatch(/^https:\/\//);
      expect(stack2.webSocketCallbackEndpoint).not.toMatch(/^wss:\/\//);
    });
  });

  describe('WsConnectHandler Lambda', () => {
    test('creates WsConnectHandler with Node.js 22.x runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-ws-connect',
        Runtime: 'nodejs22.x',
        Handler: 'index.handler',
      });
    });

    test('WsConnectHandler has WS_CONNECTIONS_TABLE and COGNITO_USER_POOL_ID env vars', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-ws-connect',
        Environment: {
          Variables: Match.objectLike({
            WS_CONNECTIONS_TABLE: 'hermes-ws-connections',
            COGNITO_USER_POOL_ID: 'us-east-1_testPool',
          }),
        },
      });
    });

    test('WsConnectHandler has DynamoDB write permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['dynamodb:PutItem', 'dynamodb:UpdateItem']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('WsDisconnectHandler Lambda', () => {
    test('creates WsDisconnectHandler with Node.js 22.x runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-ws-disconnect',
        Runtime: 'nodejs22.x',
        Handler: 'index.handler',
      });
    });

    test('WsDisconnectHandler has WS_CONNECTIONS_TABLE env var', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-ws-disconnect',
        Environment: {
          Variables: Match.objectLike({
            WS_CONNECTIONS_TABLE: 'hermes-ws-connections',
          }),
        },
      });
    });
  });

  describe('CloudWatch Log Groups', () => {
    test('all log groups have DeletionPolicy Delete', () => {
      const resources = template.toJSON().Resources;
      const logGroups = Object.values(resources).filter((r: any) => r.Type === 'AWS::Logs::LogGroup');
      expect(logGroups.length).toBeGreaterThan(0);
      logGroups.forEach((lg: any) => {
        expect(lg.DeletionPolicy).toBe('Delete');
      });
    });

    test('creates explicit log group for hermes-ws-connect', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/hermes-ws-connect',
      });
    });

    test('creates explicit log group for hermes-ws-disconnect', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/hermes-ws-disconnect',
      });
    });
  });
});
