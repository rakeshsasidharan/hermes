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
});
