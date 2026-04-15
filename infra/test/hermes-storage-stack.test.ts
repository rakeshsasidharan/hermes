import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HermesStorageStack } from '../lib/hermes-storage-stack';

describe('HermesStorageStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new HermesStorageStack(app, 'TestHermesStorageStack');
    template = Template.fromStack(stack);
  });

  test('creates S3 bucket with SSE-S3 encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });
  });

  test('S3 bucket has versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });

  test('S3 bucket blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket has lifecycle rule expiring uploads/ after 7 days', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: 'expire-uploads',
            Prefix: 'uploads/',
            ExpirationInDays: 7,
            Status: 'Enabled',
          }),
        ]),
      },
    });
  });

  test('S3 bucket is named hermes-email-store', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'hermes-email-store',
    });
  });

  test('S3 bucket is tagged with Project=hermes', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
    });
  });

  describe('Addresses table', () => {
    test('creates hermes-addresses DynamoDB table with correct PK', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-addresses',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'email', AttributeType: 'S' },
        ]),
      });
    });

    test('hermes-addresses table uses PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-addresses',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('hermes-addresses table is tagged with Project=hermes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-addresses',
        Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
      });
    });
  });

  describe('Messages table', () => {
    test('creates hermes-messages DynamoDB table with correct PK', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-messages',
        KeySchema: [
          { AttributeName: 'messageId', KeyType: 'HASH' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'messageId', AttributeType: 'S' },
        ]),
      });
    });

    test('hermes-messages table uses PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-messages',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('hermes-messages table has address-receivedAt-index GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-messages',
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'address-receivedAt-index',
            KeySchema: [
              { AttributeName: 'address', KeyType: 'HASH' },
              { AttributeName: 'receivedAt', KeyType: 'RANGE' },
            ],
          }),
        ]),
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'address', AttributeType: 'S' },
          { AttributeName: 'receivedAt', AttributeType: 'S' },
        ]),
      });
    });

    test('hermes-messages table is tagged with Project=hermes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-messages',
        Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
      });
    });
  });

  describe('Drafts table', () => {
    test('creates hermes-drafts DynamoDB table with correct PK', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-drafts',
        KeySchema: [
          { AttributeName: 'draftId', KeyType: 'HASH' },
        ],
        AttributeDefinitions: Match.arrayWith([
          { AttributeName: 'draftId', AttributeType: 'S' },
        ]),
      });
    });

    test('hermes-drafts table uses PAY_PER_REQUEST billing', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-drafts',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('hermes-drafts table is tagged with Project=hermes', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'hermes-drafts',
        Tags: Match.arrayWith([{ Key: 'Project', Value: 'hermes' }]),
      });
    });
  });
});
