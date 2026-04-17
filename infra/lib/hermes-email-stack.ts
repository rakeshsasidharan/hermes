import * as cdk from 'aws-cdk-lib/core';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { Construct } from 'constructs';

const HERMES_TAG = { key: 'Project', value: 'hermes' };

export interface HermesEmailStackProps extends cdk.StackProps {
  emailBucket: s3.IBucket;
  messagesTable: dynamodb.ITable;
  wsConnectionsTable: dynamodb.ITable;
  websocketApiEndpoint: string;
  websocketApiArn: string;
}

export class HermesEmailStack extends cdk.Stack {
  public readonly receiptRuleSet: ses.CfnReceiptRuleSet;
  public readonly sesS3DeliveryRole: iam.Role;
  public readonly inboundEmailProcessor: lambda.Function;

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
      resources: [`${props.emailBucket.bucketArn}/inbound/*`],
    }));

    cdk.Tags.of(this.sesS3DeliveryRole).add(HERMES_TAG.key, HERMES_TAG.value);

    this.inboundEmailProcessor = new lambda.Function(this, 'InboundEmailProcessor', {
      functionName: 'hermes-inbound-email-processor',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/inbound-email-processor')),
      environment: {
        MESSAGES_TABLE: props.messagesTable.tableName,
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
        S3_BUCKET: props.emailBucket.bucketName,
        WEBSOCKET_API_ENDPOINT: props.websocketApiEndpoint,
      },
    });
    cdk.Tags.of(this.inboundEmailProcessor).add(HERMES_TAG.key, HERMES_TAG.value);

    props.emailBucket.grantRead(this.inboundEmailProcessor);
    props.emailBucket.grantPut(this.inboundEmailProcessor);
    props.messagesTable.grantReadWriteData(this.inboundEmailProcessor);
    props.wsConnectionsTable.grantReadWriteData(this.inboundEmailProcessor);

    this.inboundEmailProcessor.addToRolePolicy(new iam.PolicyStatement({
      sid: 'AllowWebSocketManageConnections',
      actions: ['execute-api:ManageConnections'],
      resources: [`${props.websocketApiArn}/*`],
    }));

    props.emailBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.inboundEmailProcessor),
      { prefix: 'inbound/' },
    );
  }
}
