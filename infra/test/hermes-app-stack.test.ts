import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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

  describe('Cognito User Pool', () => {
    test('creates User Pool named hermes-user-pool', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'hermes-user-pool',
      });
    });

    test('self-sign-up is disabled', () => {
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
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
      template.hasOutput('UserPoolIdOutput', { Export: { Name: 'HermesUserPoolId' } });
    });

    test('outputs App Client ID', () => {
      template.hasOutput('UserPoolClientIdOutput', { Export: { Name: 'HermesUserPoolClientId' } });
    });
  });

  describe('Lambda function (Next.js + Lambda Web Adapter)', () => {
    test('creates Lambda function named hermes-app', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-app',
        PackageType: 'Image',
        MemorySize: 512,
        Timeout: 30,
        Architectures: ['x86_64'],
      });
    });

    test('Lambda function has all required environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-app',
        Environment: {
          Variables: Match.objectLike({
            PORT: '3000',
            ADDRESSES_TABLE: 'hermes-addresses',
            MESSAGES_TABLE: 'hermes-messages',
            DRAFTS_TABLE: 'hermes-drafts',
            WS_CONNECTIONS_TABLE: 'hermes-ws-connections',
            S3_BUCKET: 'hermes-email-store',
            SES_RULE_SET_NAME: 'hermes-receipt-rules',
            WEBSOCKET_ENDPOINT: MOCK_WS_ENDPOINT,
          }),
        },
      });
    });

    test('execution role is trusted by lambda.amazonaws.com', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'hermes-app-function',
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            }),
          ]),
        },
      });
    });

    test('execution role has SES permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'SesPermissions',
              Action: Match.arrayWith(['ses:SendRawEmail', 'ses:ListIdentities']),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('Lambda log group has DeletionPolicy Delete', () => {
      const resources = template.toJSON().Resources;
      const logGroups = Object.values(resources).filter(
        (r: any) => r.Type === 'AWS::Logs::LogGroup' &&
          r.Properties?.LogGroupName === '/aws/lambda/hermes-app',
      );
      expect(logGroups.length).toBe(1);
      expect((logGroups[0] as any).DeletionPolicy).toBe('Delete');
    });

    test('no App Runner resources in stack', () => {
      template.resourceCountIs('AWS::AppRunner::Service', 0);
      template.resourceCountIs('AWS::AppRunner::AutoScalingConfiguration', 0);
    });
  });

  describe('Function URL + CloudFront', () => {
    test('creates Lambda Function URL with auth type NONE', () => {
      template.hasResourceProperties('AWS::Lambda::Url', {
        AuthType: 'NONE',
      });
    });

    test('creates CloudFront distribution', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    test('CloudFront distribution has caching disabled', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          DefaultCacheBehavior: Match.objectLike({
            ViewerProtocolPolicy: 'redirect-to-https',
          }),
        }),
      });
    });

    test('outputs CloudFront app URL', () => {
      template.hasOutput('AppUrlOutput', { Export: { Name: 'HermesAppUrl' } });
    });
  });

  describe('EventBridge warmer', () => {
    test('creates warmer rule named hermes-app-warmer', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'hermes-app-warmer',
        ScheduleExpression: 'rate(5 minutes)',
        State: 'ENABLED',
      });
    });

    test('warmer rule targets the hermes-app Lambda', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Targets: Match.arrayWith([
          Match.objectLike({
            Input: JSON.stringify({ source: 'hermes-warmer' }),
          }),
        ]),
      });
    });

    test('Lambda has permission for EventBridge to invoke it', () => {
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
      });
    });
  });

  describe('Removal policies', () => {
    test('admin secret has DeletionPolicy Delete', () => {
      const resources = template.toJSON().Resources;
      const secrets = Object.values(resources).filter(
        (r: any) => r.Type === 'AWS::SecretsManager::Secret',
      );
      secrets.forEach((s: any) => expect(s.DeletionPolicy).toBe('Delete'));
    });
  });

  describe('Custom domain', () => {
    const MOCK_HOSTED_ZONE_CONTEXT = {
      'hosted-zone:account=123456789012:domainName=rpillai.dev:region=us-east-1': {
        Id: '/hostedzone/Z123456789TEST',
        Name: 'rpillai.dev.',
      },
    };

    let domainTemplate: Template;

    beforeEach(() => {
      const app = new cdk.App({ context: MOCK_HOSTED_ZONE_CONTEXT });
      const helperStack = new cdk.Stack(app, 'HelperStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });
      const emailBucket = s3.Bucket.fromBucketArn(helperStack, 'MockBucket', MOCK_BUCKET_ARN);
      const addressesTable = dynamodb.Table.fromTableArn(helperStack, 'MockAddresses', MOCK_ADDRESSES_ARN);
      const messagesTable = dynamodb.Table.fromTableArn(helperStack, 'MockMessages', MOCK_MESSAGES_ARN);
      const draftsTable = dynamodb.Table.fromTableArn(helperStack, 'MockDrafts', MOCK_DRAFTS_ARN);
      const wsTable = dynamodb.Table.fromTableArn(helperStack, 'MockWs', MOCK_WS_ARN);
      const mockCert = acm.Certificate.fromCertificateArn(
        helperStack,
        'MockCert',
        'arn:aws:acm:us-east-1:123456789012:certificate/mock-cert-id',
      );

      const stack = new HermesAppStack(app, 'TestHermesAppStackDomain', {
        env: { account: '123456789012', region: 'us-east-1' },
        emailBucket,
        addressesTable,
        messagesTable,
        draftsTable,
        wsConnectionsTable: wsTable,
        sesRuleSetName: 'hermes-receipt-rules',
        websocketEndpoint: MOCK_WS_ENDPOINT,
        domainName: 'hermes.rpillai.dev',
        certificate: mockCert,
        hostedZoneDomainName: 'rpillai.dev',
      });
      domainTemplate = Template.fromStack(stack);
    });

    test('Lambda has APP_DOMAIN env var set to custom domain', () => {
      domainTemplate.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'hermes-app',
        Environment: {
          Variables: Match.objectLike({
            APP_DOMAIN: 'hermes.rpillai.dev',
          }),
        },
      });
    });

    test('CloudFront distribution has hermes.rpillai.dev as alias', () => {
      domainTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Aliases: ['hermes.rpillai.dev'],
        }),
      });
    });

    test('Route 53 A record targets CloudFront distribution', () => {
      domainTemplate.resourceCountIs('AWS::Route53::RecordSet', 1);
      domainTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: 'hermes.rpillai.dev.',
        Type: 'A',
      });
    });

    test('AppUrlOutput exports custom domain URL', () => {
      domainTemplate.hasOutput('AppUrlOutput', {
        Value: 'https://hermes.rpillai.dev',
      });
    });
  });
});
