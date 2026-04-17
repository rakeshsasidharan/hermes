import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { HermesAppStack } from '../lib/hermes-app-stack';

const MOCK_BUCKET_ARN = 'arn:aws:s3:::hermes-email-store';
const MOCK_ADDRESSES_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-addresses';
const MOCK_MESSAGES_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-messages';
const MOCK_DRAFTS_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-drafts';
const MOCK_WS_ARN = 'arn:aws:dynamodb:us-east-1:123456789012:table/hermes-ws-connections';
const MOCK_WS_ENDPOINT = 'wss://abc123.execute-api.us-east-1.amazonaws.com/prod';

describe('HermesAppStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const helperStack = new cdk.Stack(app, 'HelperStack');
    const emailBucket = s3.Bucket.fromBucketArn(helperStack, 'MockBucket', MOCK_BUCKET_ARN);
    const addressesTable = dynamodb.Table.fromTableArn(helperStack, 'MockAddresses', MOCK_ADDRESSES_ARN);
    const messagesTable = dynamodb.Table.fromTableArn(helperStack, 'MockMessages', MOCK_MESSAGES_ARN);
    const draftsTable = dynamodb.Table.fromTableArn(helperStack, 'MockDrafts', MOCK_DRAFTS_ARN);
    const wsTable = dynamodb.Table.fromTableArn(helperStack, 'MockWs', MOCK_WS_ARN);

    const stack = new HermesAppStack(app, 'TestHermesAppStack', {
      emailBucket,
      addressesTable,
      messagesTable,
      draftsTable,
      wsConnectionsTable: wsTable,
      sesRuleSetName: 'hermes-receipt-rules',
      websocketEndpoint: MOCK_WS_ENDPOINT,
    });
    template = Template.fromStack(stack);
  });

  describe('Cognito User Pool (#11)', () => {
    test('creates User Pool named hermes-user-pool', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'hermes-user-pool',
      });
    });

    test('self-sign-up is disabled', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    test('creates App Client with USER_PASSWORD_AUTH and REFRESH_TOKEN_AUTH', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: 'hermes-app-client',
        ExplicitAuthFlows: Match.arrayWith([
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ]),
      });
    });

    test('creates admin user', () => {
      template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
        Username: 'admin',
      });
    });

    test('creates Secrets Manager secret for admin credentials', () => {
      template.hasResourceProperties('AWS::SecretsManager::Secret', {
        Name: 'hermes-admin-credentials',
      });
    });

    test('outputs User Pool ID', () => {
      template.hasOutput('UserPoolIdOutput', {
        Export: { Name: 'HermesUserPoolId' },
      });
    });

    test('outputs App Client ID', () => {
      template.hasOutput('UserPoolClientIdOutput', {
        Export: { Name: 'HermesUserPoolClientId' },
      });
    });
  });

  describe('ECR Repository (#12)', () => {
    test('creates ECR repository named hermes-app', () => {
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'hermes-app',
      });
    });

    test('image scan on push is enabled', () => {
      template.hasResourceProperties('AWS::ECR::Repository', {
        ImageScanningConfiguration: {
          ScanOnPush: true,
        },
      });
    });

    test('lifecycle policy keeps last 10 images', () => {
      template.hasResourceProperties('AWS::ECR::Repository', {
        LifecyclePolicy: {
          LifecyclePolicyText: Match.stringLikeRegexp('"countNumber":10'),
        },
      });
    });
  });

  describe('App Runner Service (#13)', () => {
    test('creates App Runner service named hermes-app', () => {
      template.hasResourceProperties('AWS::AppRunner::Service', {
        ServiceName: 'hermes-app',
      });
    });

    test('App Runner service uses ECR image source', () => {
      template.hasResourceProperties('AWS::AppRunner::Service', {
        SourceConfiguration: {
          ImageRepository: {
            ImageRepositoryType: 'ECR',
          },
        },
      });
    });

    test('App Runner auto-scaling is min 1 max 3', () => {
      template.hasResourceProperties('AWS::AppRunner::AutoScalingConfiguration', {
        AutoScalingConfigurationName: 'hermes-scaling',
        MinSize: 1,
        MaxSize: 3,
      });
    });

    test('instance role trusted by tasks.apprunner.amazonaws.com', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'hermes-app-runner-instance',
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: 'tasks.apprunner.amazonaws.com' },
              Action: 'sts:AssumeRole',
            }),
          ]),
        },
      });
    });

    test('instance role has SES permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'SesPermissions',
              Action: Match.arrayWith([
                'ses:SendRawEmail',
                'ses:ListIdentities',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('App Runner service has all required environment variables', () => {
      template.hasResourceProperties('AWS::AppRunner::Service', {
        SourceConfiguration: {
          ImageRepository: {
            ImageConfiguration: {
              RuntimeEnvironmentVariables: Match.arrayWith([
                Match.objectLike({ Name: 'ADDRESSES_TABLE', Value: 'hermes-addresses' }),
                Match.objectLike({ Name: 'MESSAGES_TABLE', Value: 'hermes-messages' }),
                Match.objectLike({ Name: 'DRAFTS_TABLE', Value: 'hermes-drafts' }),
                Match.objectLike({ Name: 'WS_CONNECTIONS_TABLE', Value: 'hermes-ws-connections' }),
                Match.objectLike({ Name: 'S3_BUCKET', Value: 'hermes-email-store' }),
                Match.objectLike({ Name: 'SES_RULE_SET_NAME', Value: 'hermes-receipt-rules' }),
                Match.objectLike({ Name: 'WEBSOCKET_ENDPOINT', Value: MOCK_WS_ENDPOINT }),
              ]),
            },
          },
        },
      });
    });

    test('outputs App Runner service URL', () => {
      template.hasOutput('AppRunnerServiceUrlOutput', {
        Export: { Name: 'HermesAppRunnerServiceUrl' },
      });
    });
  });
});
