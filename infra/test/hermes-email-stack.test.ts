import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { HermesEmailStack } from '../lib/hermes-email-stack';

const MOCK_BUCKET_ARN = 'arn:aws:s3:::hermes-email-store';

describe('HermesEmailStack', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new HermesEmailStack(app, 'TestHermesEmailStack', {
      emailBucketArn: MOCK_BUCKET_ARN,
    });
    template = Template.fromStack(stack);
  });

  describe('SES receipt rule set', () => {
    test('creates receipt rule set named hermes-receipt-rules', () => {
      template.hasResourceProperties('AWS::SES::ReceiptRuleSet', {
        RuleSetName: 'hermes-receipt-rules',
      });
    });

    test('sets hermes-receipt-rules as the active rule set', () => {
      template.resourceCountIs('AWS::SES::ReceiptRuleSet', 1);
      template.hasResourceProperties('AWS::SES::ReceiptActiveRuleSet', {
        RuleSetName: 'hermes-receipt-rules',
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
});
