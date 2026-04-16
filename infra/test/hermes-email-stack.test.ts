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
});
