import * as cdk from 'aws-cdk-lib/core';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesEmailStackProps extends cdk.StackProps {
  emailBucketArn: string;
}

export class HermesEmailStack extends cdk.Stack {
  public readonly receiptRuleSet: ses.CfnReceiptRuleSet;
  public readonly sesS3DeliveryRole: iam.Role;

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

    this.sesS3DeliveryRole = new iam.Role(this, 'SesS3DeliveryRole', {
      roleName: 'hermes-ses-s3-delivery',
      assumedBy: new iam.ServicePrincipal('ses.amazonaws.com'),
      description: 'Allows SES to deliver inbound email to the hermes-email-store S3 bucket',
    });

    this.sesS3DeliveryRole.addToPolicy(new iam.PolicyStatement({
      sid: 'AllowSesInboundDelivery',
      actions: ['s3:PutObject'],
      resources: [`${props.emailBucketArn}/inbound/*`],
    }));

    cdk.Tags.of(this.sesS3DeliveryRole).add(HERMES_TAG.key, HERMES_TAG.value);
  }
}
