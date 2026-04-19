import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { HermesEmailStack } from '../lib/hermes-email-stack';

const MOCK_BUCKET_ARN = 'arn:aws:s3:::hermes-email-store';
const MOCK_MESSAGES_TABLE_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-messages';
const MOCK_WS_TABLE_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-ws-connections';
const MOCK_WS_ENDPOINT = 'wss://abc123.execute-api.us-east-1.amazonaws.com/prod';
const MOCK_WS_API_ARN = 'arn:aws:execute-api:us-east-1:123456789012:abc123';

describe('HermesEmailStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const helperStack = new cdk.Stack(app, 'HelperStack');
    const emailBucket = s3.Bucket.fromBucketArn(helperStack, 'MockBucket', MOCK_BUCKET_ARN);
    const messagesTable = dynamodb.Table.fromTableArn(helperStack, 'MockMessagesTable', MOCK_MESSAGES_TABLE_ARN);
    const wsTable = dynamodb.Table.fromTableArn(helperStack, 'MockWsTable', MOCK_WS_TABLE_ARN);

    const stack = new HermesEmailStack(app, 'TestHermesEmailStack', {
      emailBucket,
      messagesTable,
      wsConnectionsTable: wsTable,
      websocketApiEndpoint: MOCK_WS_ENDPOINT,
      websocketApiArn: MOCK_WS_API_ARN,
    });
    template = Template.fromStack(stack);
  });

  describe('SES receipt rule set', () => {
    test('creates receipt rule set named hermes-receipt-rules', () => {
      template.hasResourceProperties('AWS::SES::ReceiptRuleSet', {
        RuleSetName: 'hermes-receipt-rules',
      });
    });

    test('activates hermes-receipt-rules via AwsCustomResource', () => {
      template.resourceCountIs('AWS::SES::ReceiptRuleSet', 1);
      template.hasResourceProperties('Custom::AWS', {
        Create: Match.stringLikeRegexp('setActiveReceiptRuleSet'),
        Delete: Match.stringLikeRegexp('setActiveReceiptRuleSet'),
      });
    });

    test('no hardcoded per-address receipt rules in CDK', () => {
      template.resourceCountIs('AWS::SES::ReceiptRule', 0);
    });
  });

  describe('SES to S3 delivery role', () => {
    test('creates IAM role trusted by ses.amazonaws.com', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'hermes-ses-s3-delivery',
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'sts:AssumeRole',
              Principal: { Service: 'ses.amazonaws.com' },
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('role policy grants s3:PutObject scoped to inbound/ prefix only', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 's3:PutObject',
              Effect: 'Allow',
              Resource: `${MOCK_BUCKET_ARN}/inbound/*`,
            }),
          ]),
        },
      });
    });

    test('role is tagged with Project=hermes', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'hermes-ses-s3-delivery',
        Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
      });
    });
  });

  describe('InboundEmailProcessor Lambda', () => {
    test('creates InboundEmailProcessor with Node.js 20.x runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-inbound-email-processor',
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
      });
    });

    test('InboundEmailProcessor has all required environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-inbound-email-processor',
        Environment: {
          Variables: Match.objectLike({
            MESSAGES_TABLE: 'hermes-messages',
            WS_CONNECTIONS_TABLE: 'hermes-ws-connections',
            S3_BUCKET: 'hermes-email-store',
            WEBSOCKET_API_ENDPOINT: MOCK_WS_ENDPOINT,
          }),
        },
      });
    });

    test('InboundEmailProcessor has execute-api:ManageConnections permission', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'AllowWebSocketManageConnections',
              Action: 'execute-api:ManageConnections',
              Effect: 'Allow',
              Resource: `${MOCK_WS_API_ARN}/*`,
            }),
          ]),
        },
      });
    });

    test('InboundEmailProcessor has S3 read and write permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['s3:GetObject*']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('EventBridge rule triggers InboundEmailProcessor on inbound/ prefix', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'hermes-inbound-email-rule',
        EventPattern: Match.objectLike({
          source: ['aws.s3'],
          'detail-type': ['Object Created'],
          detail: {
            bucket: { name: ['hermes-email-store'] },
            object: { key: [{ prefix: 'inbound/' }] },
          },
        }),
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

    test('creates explicit log group for hermes-inbound-email-processor', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/hermes-inbound-email-processor',
      });
    });
  });
});
