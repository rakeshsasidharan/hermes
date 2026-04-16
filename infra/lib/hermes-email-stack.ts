import * as cdk from 'aws-cdk-lib/core';
import * as ses from 'aws-cdk-lib/aws-ses';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesEmailStackProps extends cdk.StackProps {
  emailBucketArn: string;
}

export class HermesEmailStack extends cdk.Stack {
  public readonly receiptRuleSet: ses.CfnReceiptRuleSet;

  constructor(scope: Construct, id: string, props: HermesEmailStackProps) {
    super(scope, id, props);

    this.receiptRuleSet = new ses.CfnReceiptRuleSet(this, 'ReceiptRuleSet', {
      ruleSetName: 'hermes-receipt-rules',
    });

    new cdk.CfnResource(this, 'ActiveReceiptRuleSet', {
      type: 'AWS::SES::ReceiptActiveRuleSet',
      properties: {
        RuleSetName: this.receiptRuleSet.ruleSetName!,
      },
    });

    cdk.Tags.of(this.receiptRuleSet).add(HERMES_TAG.key, HERMES_TAG.value);
  }
}
